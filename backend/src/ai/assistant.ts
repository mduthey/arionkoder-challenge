import {
	generateText,
	isStepCount,
	type LanguageModel,
	NoObjectGeneratedError,
	NoOutputGeneratedError,
	Output,
} from 'ai';
import { buildInstructions } from '~/ai/prompt';
import { assistantReplySchema, type ChatRequest, type ChatResponse, type SlotOption } from '~/ai/schemas';
import { type AssistantTools, createTools } from '~/ai/tools';
import type { Config } from '~/config';
import type { Db } from '~/db/client';
import { doctors } from '~/db/schema';
import type { AppointmentDto } from '~/domain/appointments';
import { findFreeSlots } from '~/domain/availability';

const MAX_STEPS = 6;
const MAX_SLOTS = 5;
const READ_ONLY_TOOLS: (keyof AssistantTools)[] = ['listDoctors', 'findAvailableSlots'];

export class AssistantError extends Error {
	readonly code: 'assistant_failed' | 'assistant_unavailable';

	constructor(code: AssistantError['code'], message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'AssistantError';
		this.code = code;
	}
}

type RunAssistantInput = {
	model: LanguageModel;
	db: Db;
	config: Config;
	now: Date;
	request: ChatRequest;
};

export async function runAssistant({ model, db, config, now, request }: RunAssistantInput): Promise<ChatResponse> {
	const { patient, selection } = request;
	const doctorRows = db.select().from(doctors).orderBy(doctors.id).all();
	const tools = createTools({ db, config, now, patient, selection });

	const { steps, reply } = await generate(async () => {
		const result = await generateText({
			model,
			instructions: buildInstructions({ now, tz: config.clinicTimezone, doctors: doctorRows, selection }),
			messages: request.messages,
			tools,
			// The booking tool exists only on the turn where the user clicked a slot.
			activeTools: selection ? [...READ_ONLY_TOOLS, 'createAppointment'] : READ_ONLY_TOOLS,
			output: Output.object({ schema: assistantReplySchema }),
			stopWhen: isStepCount(MAX_STEPS),
		});
		// `output` throws when the model produced no valid object, so read it inside the guard.
		return { steps: result.steps, reply: result.output };
	});

	// "Booked" comes from the tool result, never from the model's text.
	const appointment = findBooked(steps);
	return {
		message: reply.message,
		slots: appointment ? [] : stillFree(db, reply.slots, { now, tz: config.clinicTimezone, email: patient?.email }),
		appointment,
	};
}

/** Maps SDK and provider failures to client-safe errors; the cause is logged by the error handler. */
async function generate<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (err) {
		if (NoOutputGeneratedError.isInstance(err) || NoObjectGeneratedError.isInstance(err)) {
			throw new AssistantError('assistant_failed', "I couldn't process that — try rephrasing.", { cause: err });
		}
		throw new AssistantError('assistant_unavailable', 'The assistant is unavailable right now. Try again later.', {
			cause: err,
		});
	}
}

function findBooked(steps: { toolResults: Array<{ toolName: string; output: unknown; dynamic?: boolean }> }[]) {
	for (const step of steps) {
		for (const r of step.toolResults) {
			if (r.dynamic || r.toolName !== 'createAppointment') continue;
			const output = r.output as { ok: boolean; appointment?: AppointmentDto };
			if (output.ok && output.appointment) return output.appointment;
		}
	}
	return null;
}

/** Drops slots the model made up or that were taken meanwhile; doctor details come from the DB. */
function stillFree(db: Db, slots: SlotOption[], ctx: { now: Date; tz: string; email?: string }) {
	const free = new Map<string, Set<string>>();
	const doctorRows = new Map(
		db
			.select()
			.from(doctors)
			.all()
			.map(d => [d.id, d]),
	);

	return slots
		.filter(slot => {
			const key = `${slot.doctorId}|${slot.date}|${slot.durationMinutes}`;
			let times = free.get(key);
			if (!times) {
				try {
					const found = findFreeSlots(db, { ...slot, now: ctx.now, tz: ctx.tz, patientEmail: ctx.email });
					times = new Set(found.map(s => s.startTime));
				} catch {
					// Unknown doctor or invalid date/duration: nothing to offer.
					times = new Set();
				}
				free.set(key, times);
			}
			return times.has(slot.startTime);
		})
		.slice(0, MAX_SLOTS)
		.map(slot => {
			// biome-ignore lint/style/noNonNullAssertion: findFreeSlots succeeded, so the doctor exists
			const doctor = doctorRows.get(slot.doctorId)!;
			return { ...slot, doctorName: doctor.name, specialty: doctor.specialty };
		});
}
