import { tool } from 'ai';
import { z } from 'zod';
import type { Patient, Selection, SlotOption } from '~/ai/schemas';
import type { Config } from '~/config';
import type { Db } from '~/db/client';
import { type DoctorRow, doctors } from '~/db/schema';
import { createAppointment } from '~/domain/appointments';
import { findFreeSlots, type Slot } from '~/domain/availability';
import { DomainError } from '~/domain/errors';
import { minuteToTime } from '~/domain/time';
import { dateSchema, timeSchema } from '~/routes/schemas';

const SLOT_LIMIT = 8;

type ToolsInput = {
	db: Db;
	config: Config;
	now: Date;
	patient?: Patient;
	selection?: Selection;
};

export function createTools({ db, config, now, patient, selection }: ToolsInput) {
	const ctx = { now, tz: config.clinicTimezone };
	const allDoctors = () => db.select().from(doctors).orderBy(doctors.id).all();
	const doctorsById = () => new Map(allDoctors().map(d => [d.id, d]));

	return {
		listDoctors: tool({
			description: 'List the clinic doctors, optionally filtered by specialty.',
			inputSchema: z.object({ specialty: z.string().optional().describe('e.g. "Dermatology"') }),
			execute: async ({ specialty }) =>
				allDoctors()
					.filter(d => !specialty || d.specialty.toLowerCase().includes(specialty.trim().toLowerCase()))
					.map(d => ({
						id: d.id,
						name: d.name,
						specialty: d.specialty,
						workStart: minuteToTime(d.workStartMinute),
						workEnd: minuteToTime(d.workEndMinute),
					})),
		}),

		findAvailableSlots: tool({
			description: `Find free slots for one doctor on one day (at most ${SLOT_LIMIT}).`,
			inputSchema: z.object({
				doctorId: z.number().int(),
				date: dateSchema.describe('YYYY-MM-DD'),
				durationMinutes: z.number().int().describe('15, 30, 45 or 60'),
				partOfDay: z.enum(['morning', 'afternoon']).optional(),
			}),
			execute: async input => {
				try {
					const slots = findFreeSlots(db, { ...input, ...ctx, patientEmail: patient?.email });
					return { ok: true as const, slots: toSlotOptions(slots.slice(0, SLOT_LIMIT), doctorsById()) };
				} catch (err) {
					if (err instanceof DomainError) return { ok: false as const, error: err.code, message: err.message };
					throw err;
				}
			},
		}),

		createAppointment: tool({
			description: 'Book the slot the user just selected. Only works with the exact selected values.',
			inputSchema: z.object({
				doctorId: z.number().int(),
				date: dateSchema,
				startTime: timeSchema,
				durationMinutes: z.number().int(),
				reason: z.string().max(500).optional().describe('Reason for the visit, if the user gave one'),
			}),
			execute: async ({ reason, ...slot }) => {
				// The model may only book what the user clicked, for the patient the app sent.
				if (!selection || !patient || !sameSlot(slot, selection)) {
					return { ok: false as const, error: 'selection_mismatch' };
				}
				try {
					const appointment = createAppointment(
						db,
						{ ...slot, reason, patientName: patient.name, patientEmail: patient.email },
						ctx,
					);
					return { ok: true as const, appointment };
				} catch (err) {
					if (!(err instanceof DomainError)) throw err;
					const suggestions = Array.isArray(err.details.suggestions)
						? toSlotOptions(err.details.suggestions as Slot[], doctorsById())
						: [];
					return { ok: false as const, error: err.code, message: err.message, suggestions };
				}
			},
		}),
	};
}

export type AssistantTools = ReturnType<typeof createTools>;

function sameSlot(a: Selection, b: Selection) {
	return (
		a.doctorId === b.doctorId &&
		a.date === b.date &&
		a.startTime === b.startTime &&
		a.durationMinutes === b.durationMinutes
	);
}

export function toSlotOptions(slots: Slot[], doctorsById: Map<number, DoctorRow>): SlotOption[] {
	return slots.flatMap(s => {
		const doctor = doctorsById.get(s.doctorId);
		if (!doctor) return [];
		return [
			{
				doctorId: s.doctorId,
				doctorName: doctor.name,
				specialty: doctor.specialty,
				date: s.date,
				startTime: s.startTime,
				durationMinutes: s.durationMinutes,
			},
		];
	});
}
