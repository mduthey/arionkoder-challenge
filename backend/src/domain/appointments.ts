import { and, asc, eq, gt, lt } from 'drizzle-orm';
import type { Db } from '~/db/client';
import { type AppointmentRow, appointments, type DoctorRow, doctors } from '~/db/schema';
import { getDoctor, suggestSlots } from '~/domain/availability';
import { DomainError } from '~/domain/errors';
import { clinicToUtc, isDuration, isValidDate, isWeekday, timeToMinute, utcToClinic } from '~/domain/time';

export type CreateAppointmentInput = {
	doctorId: number;
	date: string;
	startTime: string;
	durationMinutes: number;
	patientName: string;
	patientEmail: string;
	reason?: string | null;
};

export type DomainContext = { now: Date; tz: string };

export type AppointmentDto = {
	id: number;
	doctorId: number;
	doctorName: string;
	specialty: string;
	patientName: string;
	patientEmail: string;
	startsAt: string;
	endsAt: string;
	reason: string | null;
	status: AppointmentRow['status'];
};

const LIST_LIMIT = 100;

/** The single write path for appointments, shared by the HTTP form and the assistant. */
export function createAppointment(db: Db, input: CreateAppointmentInput, { now, tz }: DomainContext): AppointmentDto {
	const doctor = getDoctor(db, input.doctorId);

	const { date, startTime, durationMinutes } = input;
	const startMinute = timeToMinute(startTime);
	if (!isDuration(durationMinutes)) {
		throw new DomainError('invalid_time', 'Duration must be 15, 30, 45 or 60 minutes');
	}
	const startsAt = clinicToUtc(date, startTime, tz);
	// Round-trip catches impossible dates/times (2026-02-30, 25:00) and DST gaps.
	const local = isValidDate(date) ? utcToClinic(startsAt.getTime(), tz) : null;
	if (!local || local.date !== date || local.time !== startTime) {
		throw new DomainError('invalid_time', `Invalid date or time: ${date} ${startTime}`);
	}
	if (startMinute % 15 !== 0) {
		throw new DomainError('invalid_time', 'Appointments start on a 15-minute boundary');
	}
	if (startsAt.getTime() <= now.getTime()) {
		throw new DomainError('invalid_time', 'Appointments must be in the future');
	}
	if (!isWeekday(local.weekday)) {
		throw new DomainError('outside_hours', 'The clinic is open Monday to Friday');
	}
	if (startMinute < doctor.workStartMinute || startMinute + durationMinutes > doctor.workEndMinute) {
		throw new DomainError('outside_hours', `${doctor.name} does not work at that time`);
	}

	const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
	const patientEmail = input.patientEmail.trim().toLowerCase();

	const result = db.transaction(
		(tx): { conflict: 'doctor_conflict' | 'patient_conflict' } | { conflict: null; row: AppointmentRow } => {
			const overlapping = and(
				eq(appointments.status, 'scheduled'),
				lt(appointments.startsAt, endsAt),
				gt(appointments.endsAt, startsAt),
			);
			const doctorClash = tx
				.select({ id: appointments.id })
				.from(appointments)
				.where(and(eq(appointments.doctorId, doctor.id), overlapping))
				.get();
			if (doctorClash) return { conflict: 'doctor_conflict' };

			const patientClash = tx
				.select({ id: appointments.id })
				.from(appointments)
				.where(and(eq(appointments.patientEmail, patientEmail), overlapping))
				.get();
			if (patientClash) return { conflict: 'patient_conflict' };

			const row = tx
				.insert(appointments)
				.values({
					doctorId: doctor.id,
					patientName: input.patientName.trim(),
					patientEmail,
					startsAt,
					endsAt,
					reason: input.reason?.trim() || null,
					createdAt: now,
				})
				.returning()
				.get();
			return { conflict: null, row };
		},
		{ behavior: 'immediate' },
	);

	if (result.conflict) {
		const suggestions = suggestSlots(db, {
			doctorId: doctor.id,
			from: date,
			after: startsAt,
			durationMinutes,
			now,
			tz,
			patientEmail,
		});
		const message =
			result.conflict === 'doctor_conflict'
				? `${doctor.name} already has an appointment at that time`
				: 'This patient already has an appointment at that time';
		throw new DomainError(result.conflict, message, { suggestions });
	}
	return toDto(result.row, doctor);
}

export function cancelAppointment(db: Db, id: number): AppointmentDto {
	const found = db
		.select()
		.from(appointments)
		.innerJoin(doctors, eq(doctors.id, appointments.doctorId))
		.where(eq(appointments.id, id))
		.get();
	if (!found) {
		throw new DomainError('not_found', `Appointment ${id} not found`);
	}
	if (found.appointments.status === 'cancelled') {
		return toDto(found.appointments, found.doctors);
	}
	const row = db.update(appointments).set({ status: 'cancelled' }).where(eq(appointments.id, id)).returning().get();
	return toDto(row ?? found.appointments, found.doctors);
}

/** Scheduled appointments still running at or after `from` (and starting before `to`). */
export function listAppointments(db: Db, { doctorId, from, to }: { doctorId?: number; from: Date; to?: Date }) {
	return db
		.select()
		.from(appointments)
		.innerJoin(doctors, eq(doctors.id, appointments.doctorId))
		.where(
			and(
				eq(appointments.status, 'scheduled'),
				gt(appointments.endsAt, from),
				to ? lt(appointments.startsAt, to) : undefined,
				doctorId === undefined ? undefined : eq(appointments.doctorId, doctorId),
			),
		)
		.orderBy(asc(appointments.startsAt), asc(appointments.id))
		.limit(LIST_LIMIT)
		.all()
		.map(r => toDto(r.appointments, r.doctors));
}

function toDto(row: AppointmentRow, doctor: DoctorRow): AppointmentDto {
	return {
		id: row.id,
		doctorId: row.doctorId,
		doctorName: doctor.name,
		specialty: doctor.specialty,
		patientName: row.patientName,
		patientEmail: row.patientEmail,
		startsAt: row.startsAt.toISOString(),
		endsAt: row.endsAt.toISOString(),
		reason: row.reason,
		status: row.status,
	};
}
