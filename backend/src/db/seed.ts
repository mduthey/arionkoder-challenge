import type { Db } from '~/db/client';
import { doctors } from '~/db/schema';
import { createAppointment } from '~/domain/appointments';
import { addDays, isWeekday, utcToClinic, weekdayOf } from '~/domain/time';

const DOCTORS = [
	{ name: 'Dr. Laura Méndez', specialty: 'General Practice', workStartMinute: 9 * 60, workEndMinute: 17 * 60 },
	{ name: 'Dr. Martín Ríos', specialty: 'Dermatology', workStartMinute: 9 * 60, workEndMinute: 17 * 60 },
	{ name: 'Dr. Sofía Herrera', specialty: 'Cardiology', workStartMinute: 8 * 60, workEndMinute: 14 * 60 },
	{ name: 'Dr. Diego Fernández', specialty: 'Pediatrics', workStartMinute: 9 * 60, workEndMinute: 17 * 60 },
];

// [weekday index (0–2), doctor index, start, duration, patient]
const APPOINTMENTS = [
	[0, 0, '10:00', 30, 'Ana Gómez', 'ana.gomez@example.com', 'Annual check-up'],
	[0, 0, '10:30', 30, 'Pablo Suárez', 'pablo.suarez@example.com', 'Persistent cough'],
	[0, 2, '09:00', 45, 'Carlos Pereyra', 'carlos.pereyra@example.com', 'Follow-up ECG'],
	[1, 1, '14:00', 30, 'Lucía Torres', 'lucia.torres@example.com', 'Skin rash'],
	[1, 3, '11:00', 30, 'Mateo Díaz', 'mateo.diaz.parent@example.com', 'Vaccination'],
	[2, 0, '15:00', 60, 'Ana Gómez', 'ana.gomez@example.com', 'Lab results review'],
] as const;

export type SeedResult = { seeded: false } | { seeded: true; doctors: number; appointments: number };

/** Idempotent demo data: skipped when any doctor exists. Appointments land on the next 3 weekdays after `now`. */
export function seed(db: Db, { now, tz }: { now: Date; tz: string }): SeedResult {
	if (db.select({ id: doctors.id }).from(doctors).limit(1).get()) {
		return { seeded: false };
	}

	const inserted = db.insert(doctors).values(DOCTORS).returning().all();
	const days = nextWeekdays(utcToClinic(now.getTime(), tz).date, 3);
	for (const [day, doctor, startTime, durationMinutes, patientName, patientEmail, reason] of APPOINTMENTS) {
		createAppointment(
			db,
			{
				doctorId: inserted[doctor]?.id ?? 0,
				date: days[day] ?? '',
				startTime,
				durationMinutes,
				patientName,
				patientEmail,
				reason,
			},
			{ now, tz },
		);
	}
	return { seeded: true, doctors: inserted.length, appointments: APPOINTMENTS.length };
}

function nextWeekdays(today: string, count: number) {
	const days: string[] = [];
	for (let date = addDays(today, 1); days.length < count; date = addDays(date, 1)) {
		if (isWeekday(weekdayOf(date))) days.push(date);
	}
	return days;
}
