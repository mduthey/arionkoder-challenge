# Spec 02 — Booking frontend

**Goal:** a single page where a user can book through the form, see availability, hit and recover from conflicts, and
see and cancel upcoming appointments.

**Depends on:** 01. **Branch:** `spec/02-booking-frontend`. Shared contract: [`docs/PLAN.md`](../PLAN.md) (§API, §Frontend).

## In scope

- API client and query hooks.
- Booking form (TanStack Form + zod), slot chips, conflict UI with suggestions.
- Appointments list with cancel.
- Toasts.
- Tests.

## Out of scope

Assistant panel (spec 04), routing, auth, i18n.

## Dependencies

- `@tanstack/react-query` and `@tanstack/react-form`, plus `zod`.
- shadcn: `card input label select textarea badge sonner field alert skeleton`. Run `pnpm lint:fix` after adding them.
- If shadcn's `field` component isn't available in the installed CLI version, use `label` plus a small `FieldError` helper.
- Follow shadcn's TanStack Form guide for wiring `form.Field` into `Field` components.

## Files

### `src/lib/api.ts`

- `apiFetch<T>(path, init?)`:
  - Prefixes `/api` and sets JSON headers.
  - On a non-2xx response it throws `ApiError { status, code, message, body }`, built from the backend's
    `{ error, message, ... }` shape.
- Types that mirror the backend DTOs, kept local on purpose (see PLAN.md §Out of scope):
  `Doctor`, `Slot`, `Appointment`, `ConflictBody` (`{ error: 'doctor_conflict' | 'patient_conflict', message, suggestions: Slot[] }`)
  and `AppConfig`.
- Functions:
  - `getConfig()`, `getDoctors()`
  - `getAvailability(doctorId, date, duration)`
  - `getAppointments()`
  - `createAppointment(input)`, `cancelAppointment(id)`

### `src/lib/queries.ts`

- Query keys: `['config']`, `['doctors']`, `['availability', doctorId, date, duration]`, `['appointments']`.
- Hooks:
  - `useConfig()` and `useDoctors()`, with `staleTime: Infinity`
  - `useAvailability(doctorId?, date?, duration)`, `enabled` only when all three are set
  - `useAppointments()`
  - `useCreateAppointment()` and `useCancelAppointment()`: on success, invalidate `['appointments']` and `['availability']`

### `src/lib/format.ts`

- `formatSlot(isoOrDate, tz)` and `formatRange(startIso, endIso, tz)`: `Intl.DateTimeFormat` with `timeZone: tz`, for
  example "Tue 3 Nov, 14:30–15:00".
- `todayInTz(tz)` → `YYYY-MM-DD`, used for the date input's `min`.

### `src/main.tsx`

`QueryClientProvider`, with `retry: 1` and no retries on 4xx, plus `<Toaster />` from sonner.

### `src/App.tsx`

- Layout: header ("Clinic Booking" plus a one-line subtitle), then a responsive two-column grid. The left column holds the
  `BookingForm` card. The right column is a placeholder slot for spec 04's assistant (render nothing for now). Below the
  grid, the `AppointmentList` card.
- Loading and error states for config and doctors use `skeleton` and `alert`.

### `src/features/booking/BookingForm.tsx`

- Built with TanStack Form `useForm`, with defaults and `validators: { onChange: bookingSchema }`. `bookingSchema` is zod:
  - `doctorId` required
  - `date` required, ≥ today
  - `startTime` matching `HH:mm`
  - `durationMinutes` ∈ {15, 30, 45, 60}
  - `patientName` 1–100 characters
  - `patientEmail` a valid email
  - `reason` optional, ≤ 500 characters
- Fields:
  - doctor `select` (name · specialty)
  - `input type=date` (min = today in clinic TZ)
  - `input type=time step=900`
  - duration `select`
  - name, email
  - reason `textarea`
- `SlotPicker` sits under the date and time fields.
- Submit calls `useCreateAppointment().mutateAsync`:
  - On 201: a success toast ("Booked with Dr. X — Tue 3 Nov 14:30"), then reset the time and reason (keep doctor, name and email).
  - On 409: render an `alert` with the backend message and the `suggestions` as chips. Clicking a chip sets
    `doctorId`/`date`/`startTime` and focuses submit.
  - On 422 and 400: show the message inline in an `alert`.
- The submit button is disabled while submitting or while the form is invalid.

### `src/features/booking/SlotPicker.tsx`

- Props: `doctorId`, `date`, `durationMinutes`, `onPick(startTime)`.
- Uses `useAvailability` and shows free slots as small buttons (`badge` or outline `button`), scrollable if there are many.
  The empty state reads "No free slots that day".

### `src/features/booking/AppointmentList.tsx`

- Upcoming appointments grouped by day, each with time range, doctor · specialty, patient and reason.
- A Cancel button (`variant=ghost`) calls `useCancelAppointment` and shows a toast. No confirm dialog: avoid browser dialogs.
- Empty state.

## Visual direction

Clean and calm: shadcn defaults with neutral surfaces and one accent color for primary actions and selected slots.
Use generous spacing and readable sizes. No gradients or decorative clutter. It must work at phone width (single column).

## Tests

- `src/test/render.tsx`: `renderWithClient(ui)` wraps the UI in a fresh `QueryClient` with `retry: false`.
- `src/features/booking/BookingForm.test.tsx`, with `fetch` stubbed by `vi.stubGlobal('fetch', vi.fn(...))` and routed by URL:
  - submitting empty shows validation messages, and no POST is sent
  - a POST that returns 409 with two suggestions renders the conflict message and two chips; clicking a chip updates the time input

## Done when

- Lint, typecheck, test and build all pass.
- With `pnpm dev`, in the browser:
  - booking a free slot shows a toast, the appointment appears in the list, and the slot disappears from the chips
  - booking the same slot again shows a 409 with suggestions, and clicking a suggestion and submitting books it
  - the same patient booked with another doctor at an overlapping time gets a 409
  - cancel removes the appointment from the list, and the slot chip reappears
- The layout holds at about 375px width.

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm dev   # walk the browser checklist above
```
