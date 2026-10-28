import { and, eq, gt, lt, type SQL } from 'drizzle-orm';
import type { Db } from '~/db/client';
import { appointments, type DoctorRow, doctors } from '~/db/schema';
import { DomainError } from '~/domain/errors';
import {
	addDays,
	clinicToUtc,
	type Interval,
	isDuration,
	isValidDate,
	isWeekday,
	minuteToTime,
	overlaps,
	SLOT_STEP,
	weekdayOf,
} from '~/domain/time';

export type PartOfDay = 'morning' | 'afternoon';

export type Slot = {
	doctorId: number;
	date: string;
	startTime: string;
	durationMinutes: number;
	startsAt: string;
};

type SlotQuery = {
	doctorId: number;
	date: string;
	durationMinutes: number;
	now: Date;
	tz: string;
	partOfDay?: PartOfDay;
	/** Also skip slots that overlap this patient's appointments (with any doctor). */
	patientEmail?: string;
	/** Only slots starting strictly after this instant (defaults to `now`). */
	after?: Date;
};

const NOON = 12 * 60;

export function getDoctor(db: Db, doctorId: number): DoctorRow {
	const doctor = db.select().from(doctors).where(eq(doctors.id, doctorId)).get();
	if (!doctor) {
		throw new DomainError('not_found', `Doctor ${doctorId} not found`);
	}
	return doctor;
}

export function findFreeSlots(db: Db, query: SlotQuery): Slot[] {
	const { date, durationMinutes } = query;
	if (!isValidDate(date)) {
		throw new DomainError('invalid_time', `Invalid date ${date}`);
	}
	if (!isDuration(durationMinutes)) {
		throw new DomainError('invalid_time', `Duration must be 15, 30, 45 or 60 minutes`);
	}
	return freeSlotsForDay(db, getDoctor(db, query.doctorId), query);
}

/** Next free slots from `from` (a clinic-local date), scanning up to 7 days ahead. */
export function suggestSlots(
	db: Db,
	query: Omit<SlotQuery, 'date' | 'partOfDay'> & { from: string; count?: number },
): Slot[] {
	const { from, count = 3 } = query;
	const doctor = getDoctor(db, query.doctorId);
	const found: Slot[] = [];
	for (let offset = 0; offset <= 7 && found.length < count; offset++) {
		found.push(...freeSlotsForDay(db, doctor, { ...query, date: addDays(from, offset) }));
	}
	return found.slice(0, count);
}

function freeSlotsForDay(db: Db, doctor: DoctorRow, query: SlotQuery): Slot[] {
	const { date, durationMinutes, now, tz, partOfDay, patientEmail } = query;
	const after = Math.max(now.getTime(), query.after?.getTime() ?? 0);
	if (!isWeekday(weekdayOf(date))) {
		return [];
	}

	const dayStart = clinicToUtc(date, '00:00', tz);
	const dayEnd = clinicToUtc(addDays(date, 1), '00:00', tz);
	const busy = busyIntervals(db, eq(appointments.doctorId, doctor.id), dayStart, dayEnd);
	if (patientEmail) {
		busy.push(...busyIntervals(db, eq(appointments.patientEmail, patientEmail.toLowerCase()), dayStart, dayEnd));
	}

	const slots: Slot[] = [];
	for (let minute = doctor.workStartMinute; minute + durationMinutes <= doctor.workEndMinute; minute += SLOT_STEP) {
		if (partOfDay === 'morning' && minute >= NOON) break;
		if (partOfDay === 'afternoon' && minute < NOON) continue;

		const startTime = minuteToTime(minute);
		const start = clinicToUtc(date, startTime, tz).getTime();
		const candidate = { start, end: start + durationMinutes * 60_000 };
		if (start <= after || busy.some(b => overlaps(candidate, b))) continue;

		slots.push({ doctorId: doctor.id, date, startTime, durationMinutes, startsAt: new Date(start).toISOString() });
	}
	return slots;
}

function busyIntervals(db: Db, owner: SQL, from: Date, to: Date): Interval[] {
	return db
		.select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt })
		.from(appointments)
		.where(
			and(owner, eq(appointments.status, 'scheduled'), lt(appointments.startsAt, to), gt(appointments.endsAt, from)),
		)
		.all()
		.map(a => ({ start: a.startsAt.getTime(), end: a.endsAt.getTime() }));
}
