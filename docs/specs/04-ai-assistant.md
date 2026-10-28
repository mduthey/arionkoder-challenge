# Spec 04 — AI assistant

**Goal:** a chat assistant that finds real free slots with tools and shows them as cards. When the user clicks one, the
assistant books it through the same domain service the form uses, with server-side guards so the model can't book
anything the user didn't pick.

**Depends on:** 01, 02. **Branch:** `spec/04-ai-assistant`. Shared contract: [`docs/PLAN.md`](../PLAN.md) (§AI assistant).

## In scope

AI config, the `ai/` module (prompt, schemas, tools, assistant), `POST /api/assistant/chat`, `aiEnabled` in
`/api/config`, the `AssistantPanel` UI, and tests with a mock model.

## Out of scope

- Streaming.
- Conversation persistence.
- Rate limiting and cost caps.
- Any tool that cancels or modifies appointments.

## Dependencies

- `ai` (v7), in `backend/` only. Strings like `anthropic/claude-haiku-5.5` route through AI Gateway by default.
- Before writing code, read the installed `.d.ts` to confirm these names: `generateText`, `Output`, `tool`, `isStepCount`,
  the `activeTools` option, the shape of `result.steps[i].toolResults[j]` (`toolName`, `output`), the `instructions`
  option, and `MockLanguageModelV4` from `ai/test`.

## Backend

### Config (`config.ts`)

- `AI_GATEWAY_API_KEY`: optional string.
- `AI_MODEL`: default `anthropic/claude-haiku-5.5`.

In `index.ts`, set `model = config.AI_GATEWAY_API_KEY ? config.AI_MODEL : null` and pass it to `buildApp`
(`AppDeps.model: LanguageModel | null`).

### `/api/config`

Returns `{ clinicTimezone, aiEnabled: deps.model !== null }`.

### `src/ai/schemas.ts`

- `ChatRequest`:
  - `messages`: an array of 1–20 `{ role: 'user' | 'assistant', content: string (1–2000) }`.
  - `patient`: `{ name: 1–100, email: z.email() }`, optional.
  - `selection`: `{ doctorId, date, startTime, durationMinutes }`, optional.
  - Refinement: `selection` requires `patient`.
- `SlotOption`: `{ doctorId, doctorName, specialty, date, startTime, durationMinutes }`.
- `AssistantReply` (the structured output): `{ message: string, slots: SlotOption[] }`. Use `slots: []` when there are
  none, rather than making the field optional, which keeps the schema simple for the model.
- `ChatResponse`: `{ message, slots, appointment: AppointmentDto | null }`.

### `src/ai/prompt.ts`

`buildInstructions({ now, tz, doctors })` covers:
- the assistant's role: book appointments at this clinic only, and stay concise
- today's date, weekday and time in `tz`, with an explicit "resolve relative dates such as 'next Tuesday' against this"
- the doctors list (id, name, specialty, hours) and the rules (weekdays, 15-min steps, durations 15/30/45/60)
- **only** offer slots returned by `findAvailableSlots` (at most 5), and ask a short follow-up question when the
  specialty, day or duration is missing (default duration 30)
- when the latest user turn is a slot selection, call `createAppointment` with exactly those values, and say whether it succeeded
- never ask for or invent patient details; the app provides them

### `src/ai/tools.ts`

`createTools({ db, config, now, patient, selection })` returns:
- `listDoctors({ specialty? })` → doctors, with a case-insensitive specialty match.
- `findAvailableSlots({ doctorId, date, durationMinutes, partOfDay? })` → `SlotOption[]` via `findFreeSlots`, capped at 8.
- `createAppointment({ doctorId, date, startTime, durationMinutes, reason? })`:
  - If `!selection` or any field differs from `selection`, return `{ ok: false, error: 'selection_mismatch' }`.
  - Otherwise call `domain/appointments#createAppointment(db, { ...args, patientName: patient.name, patientEmail: patient.email }, { now, tz })`.
    The patient's details always come from the closure.
  - On `DomainError`, return `{ ok: false, error: code, message, suggestions }` as data the model can act on. Don't throw.
  - On success, return `{ ok: true, appointment }`.

### `src/ai/assistant.ts`

`runAssistant({ model, db, config, now, request })`:
- Builds the tools for this request.
- Exposes only the two read-only tools, unless the request carries a `selection`; only then is `createAppointment`
  active too (`activeTools`).
- Makes a single `generateText` call with:
  - the instructions from `buildInstructions`
  - the request messages
  - `AssistantReply` as the structured `output`
  - a bounded step count (about 6)
- `appointment`: the first `createAppointment` tool result with `ok: true` across `result.steps`, otherwise `null`.
  Never derive it from the model's text.
- `slots`: re-check each slot in `result.output.slots` against `findFreeSlots` and drop stale ones. If an appointment was
  just booked, return `slots: []`.
- Errors:
  - `NoOutputGeneratedError` / `NoObjectGeneratedError` → `DomainError`-like 502 `{ error: 'assistant_failed', message: "I couldn't process that — try rephrasing." }`.
  - Provider/gateway errors → 502 `assistant_unavailable`.
  - Log the details. Never return provider error text to the client.

### `src/routes/assistant.ts`

`POST /assistant/chat`:
- `deps.model === null` → 503 `{ error: 'assistant_disabled' }`.
- Otherwise validate with `ChatRequest` and return a `ChatResponse`.

## Frontend

### `src/lib/api.ts`

Add the `ChatMessage`, `SlotOption`, `ChatRequest` and `ChatResponse` types, and `sendChat(req)`.

### `src/features/assistant/AssistantPanel.tsx`

- Rendered in the right-hand column only when `config.aiEnabled`. Otherwise show a muted card: "Assistant unavailable —
  set `AI_GATEWAY_API_KEY` to enable it."
- **Patient** fields (name, email) at the top, using TanStack Form with the same zod rules as the booking form. They are
  required before any card can be clicked; disabled cards show a hint.
- **Messages**: local state `UiMessage[] = { role, content, slots?, appointment? }`, auto-scrolled. Assistant messages render their
  `slots` as cards (doctor · specialty, formatted date/time, duration).
- Sending text calls `sendChat` with `{ messages: last 20 as { role, content }, patient? }`.
- Clicking a card:
  - Append the user message `Book <doctorName> on <formatted date> at <time> (<duration> min)`.
  - Send it with `selection` and `patient`.
  - Disable all cards while pending.
- Response handling:
  - Append the assistant message with its `slots`.
  - If `appointment` is set: show a success toast, render a confirmation badge in that message, and invalidate
    `['appointments']` and `['availability']`.
- A pending indicator (typing dots or a skeleton) is shown during the request. Errors (502/503) appear as an inline assistant-styled error message.
- Use a `textarea` input, where Enter sends and Shift+Enter adds a newline. Add a "Clear conversation" ghost button.

## Tests

### `backend/src/ai/assistant.test.ts`

Uses `createTestApp({ now, model: new MockLanguageModelV4({ doGenerate: [...] }) })` and `app.inject`.
1. **Selection turn books.** Step 1 is a tool-call `createAppointment` with args equal to `selection`. Step 2 is text with
   JSON `{ "message": "Booked!", "slots": [] }`. Expect 200, `appointment` non-null, and one row in the DB.
2. **Mismatch rejected.** Same as test 1, but the tool-call `startTime` differs from `selection`. Expect `appointment: null`
   and no row. The tool result fed back to the model (visible in the mock's second call prompt) contains `selection_mismatch`.
3. **No selection, no booking tool.** Send a plain text turn. Assert that the mock's recorded first call options don't list
   `createAppointment` among the available tools.
4. **Taken slot.** Pre-insert an appointment at the selection's time, then run the booking turn. Expect `appointment: null`
   and no new row, with the tool result containing `doctor_conflict` and `suggestions`.
5. **Disabled.** `buildApp` with `model: null`: `POST /api/assistant/chat` returns 503, and `/api/config` returns `aiEnabled: false`.

Build mock responses with a small helper (`toolCallStep(name, input)`, `textStep(json)`) to avoid repeating the
usage/finishReason boilerplate.

### `frontend/src/features/assistant/AssistantPanel.test.tsx`

`fetch` is stubbed.
- After a reply with 2 slots, two cards render.
- With patient fields filled, clicking a card POSTs a body containing `selection` and `patient`.
- A reply with `appointment` shows the confirmation.

## Done when

- Lint, typecheck, test and build all pass, and the mock-model tests cover all five backend cases.
- With a real `AI_GATEWAY_API_KEY` in `.env` (`pnpm dev` or compose):
  - "I need a dermatologist next Tuesday afternoon, 30 minutes" shows real free slots as cards.
  - Clicking one makes the assistant confirm. The appointment appears in the list, and its slot is gone from the form's chips.
  - Booking that slot from the form first and then clicking the card makes the assistant report the conflict and offer new cards.
- Without the key, the panel shows the "unavailable" card and `/api/assistant/chat` returns 503.
- If no key is available while implementing, say so explicitly when reporting. The live check then stays open, and the
  mock tests are the evidence.

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
AI_GATEWAY_API_KEY=... pnpm dev   # run the browser checklist above
```
