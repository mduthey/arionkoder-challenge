import { describe, expect, it } from 'vitest';
import { createAppointment } from '~/domain/appointments';
import { findFreeSlots, suggestSlots } from '~/domain/availability';
import { createTestDb, TEST_NOW, TEST_TZ } from '~/test/helpers';

const ctx = { now: TEST_NOW, tz: TEST_TZ };
const patient = { patientName: 'Jane Roe', patientEmail: 'jane@example.com' };

describe('findFreeSlots', () => {
	it('covers the working window, with the last slot ending exactly at workEnd', () => {
		const { db, doctors } = createTestDb();

		const slots = findFreeSlots(db, { doctorId: doctors.gp.id, date: '2026-11-03', durationMinutes: 30, ...ctx });

		expect(slots[0]?.startTime).toBe('09:00');
		expect(slots.at(-1)?.startTime).toBe('16:30');
		expect(slots).toHaveLength(31);
		expect(slots[0]).toEqual({
			doctorId: doctors.gp.id,
			date: '2026-11-03',
			startTime: '09:00',
			durationMinutes: 30,
			startsAt: '2026-11-03T12:00:00.000Z',
		});
	});

	it('removes candidates overlapping an existing appointment', () => {
		const { db, doctors } = createTestDb();
		createAppointment(
			db,
			{ doctorId: doctors.gp.id, date: '2026-11-03', startTime: '10:00', durationMinutes: 30, ...patient },
			ctx,
		);

		const times = findFreeSlots(db, { doctorId: doctors.gp.id, date: '2026-11-03', durationMinutes: 30, ...ctx }).map(
			s => s.startTime,
		);

		expect(times).toContain('09:30');
		expect(times).not.toContain('09:45');
		expect(times).not.toContain('10:00');
		expect(times).not.toContain('10:15');
		expect(times).toContain('10:30');
	});

	it('removes past slots', () => {
		const { db, doctors } = createTestDb();
		const now = new Date('2026-11-03T13:10:00Z'); // 10:10 local

		const slots = findFreeSlots(db, {
			doctorId: doctors.gp.id,
			date: '2026-11-03',
			durationMinutes: 15,
			now,
			tz: TEST_TZ,
		});

		expect(slots[0]?.startTime).toBe('10:15');
	});

	it('returns [] on weekends', () => {
		const { db, doctors } = createTestDb();

		expect(findFreeSlots(db, { doctorId: doctors.gp.id, date: '2026-11-07', durationMinutes: 30, ...ctx })).toEqual([]);
	});

	it('filters by part of day', () => {
		const { db, doctors } = createTestDb();
		const query = { doctorId: doctors.gp.id, date: '2026-11-03', durationMinutes: 60, ...ctx };

		const morning = findFreeSlots(db, { ...query, partOfDay: 'morning' });
		const afternoon = findFreeSlots(db, { ...query, partOfDay: 'afternoon' });

		expect(morning.at(-1)?.startTime).toBe('11:45');
		expect(afternoon[0]?.startTime).toBe('12:00');
	});
});

describe('suggestSlots', () => {
	it('skips weekends when scanning ahead', () => {
		const { db, doctors } = createTestDb();

		const slots = suggestSlots(db, { doctorId: doctors.gp.id, from: '2026-11-07', durationMinutes: 30, ...ctx });

		expect(slots.map(s => `${s.date} ${s.startTime}`)).toEqual([
			'2026-11-09 09:00',
			'2026-11-09 09:15',
			'2026-11-09 09:30',
		]);
	});
});
