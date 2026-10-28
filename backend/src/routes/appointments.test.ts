import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '~/app';
import { createTestApp } from '~/test/helpers';

let app: App;
let doctors: ReturnType<typeof createTestApp>['doctors'];

beforeEach(() => {
	({ app, doctors } = createTestApp());
});

afterEach(async () => {
	await app.close();
});

function book(overrides: Record<string, unknown> = {}) {
	return app.inject({
		method: 'POST',
		url: '/api/appointments',
		payload: {
			doctorId: doctors.gp.id,
			date: '2026-11-03',
			startTime: '10:00',
			durationMinutes: 30,
			patientName: 'Jane Roe',
			patientEmail: 'jane@example.com',
			reason: 'Check-up',
			...overrides,
		},
	});
}

describe('POST /api/appointments', () => {
	it('creates an appointment that then shows up in the list', async () => {
		const res = await book({ patientEmail: 'Jane@Example.com' });

		expect(res.statusCode).toBe(201);
		const created = res.json();
		expect(created).toMatchObject({
			doctorId: doctors.gp.id,
			doctorName: 'Dr. Ada General',
			specialty: 'General Practice',
			patientEmail: 'jane@example.com',
			startsAt: '2026-11-03T13:00:00.000Z',
			endsAt: '2026-11-03T13:30:00.000Z',
			status: 'scheduled',
		});

		const list = await app.inject({ method: 'GET', url: '/api/appointments' });
		expect(list.json()).toEqual([created]);
	});

	it('rejects an overlapping slot for the same doctor with suggestions', async () => {
		await book();

		const res = await book({ startTime: '10:15', patientEmail: 'other@example.com' });

		expect(res.statusCode).toBe(409);
		const body = res.json();
		expect(body.error).toBe('doctor_conflict');
		expect(body.suggestions.length).toBeGreaterThan(0);
		// Next free slots after the requested time, skipping the booked 10:00–10:30.
		expect(body.suggestions.map((s: { startTime: string }) => s.startTime)).toEqual(['10:30', '10:45', '11:00']);
	});

	it('rejects the same patient (any email case) with another doctor at the same time', async () => {
		await book();

		const res = await book({ doctorId: doctors.cardio.id, patientEmail: 'JANE@example.com' });

		expect(res.statusCode).toBe(409);
		expect(res.json()).toMatchObject({ error: 'patient_conflict' });
		// Suggestions also avoid the patient's own appointment.
		expect(res.json().suggestions[0]).toMatchObject({ doctorId: doctors.cardio.id, startTime: '10:30' });
	});

	it('allows back-to-back appointments', async () => {
		await book();

		expect((await book({ startTime: '10:30', patientEmail: 'other@example.com' })).statusCode).toBe(201);
	});

	it.each([
		['after hours', { startTime: '18:00' }, 'outside_hours'],
		['on a Saturday', { date: '2026-11-07' }, 'outside_hours'],
		['running past the end of the day', { startTime: '16:45', durationMinutes: 30 }, 'outside_hours'],
		['off the 15-minute grid', { startTime: '10:07' }, 'invalid_time'],
		['with an unsupported duration', { durationMinutes: 20 }, 'invalid_time'],
		['in the past', { date: '2026-10-30' }, 'invalid_time'],
		['on an impossible date', { date: '2026-11-31' }, 'invalid_time'],
	])('returns 422 when booking %s', async (_, overrides, error) => {
		const res = await book(overrides);

		expect(res.statusCode).toBe(422);
		expect(res.json()).toMatchObject({ error });
	});

	it('returns 400 for an invalid body', async () => {
		const res = await book({ patientEmail: 'not-an-email', startTime: '10am' });

		expect(res.statusCode).toBe(400);
		expect(res.json()).toMatchObject({ error: 'validation' });
	});

	it('returns 404 for an unknown doctor', async () => {
		const res = await book({ doctorId: 999 });

		expect(res.statusCode).toBe(404);
		expect(res.json()).toMatchObject({ error: 'not_found' });
	});
});

describe('POST /api/appointments/:id/cancel', () => {
	it('cancels, frees the slot, and is idempotent', async () => {
		const { id } = (await book()).json();

		const res = await app.inject({ method: 'POST', url: `/api/appointments/${id}/cancel` });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toMatchObject({ id, status: 'cancelled' });

		const again = await app.inject({ method: 'POST', url: `/api/appointments/${id}/cancel` });
		expect(again.json()).toMatchObject({ id, status: 'cancelled' });

		expect((await app.inject({ method: 'GET', url: '/api/appointments' })).json()).toEqual([]);
		expect((await book({ patientEmail: 'other@example.com' })).statusCode).toBe(201);
	});

	it('returns 404 for an unknown id', async () => {
		const res = await app.inject({ method: 'POST', url: '/api/appointments/999/cancel' });

		expect(res.statusCode).toBe(404);
		expect(res.json()).toMatchObject({ error: 'not_found' });
	});
});

describe('GET /api/appointments', () => {
	it('filters by doctor and time range', async () => {
		await book();
		await book({ doctorId: doctors.cardio.id, startTime: '11:00' });
		await book({ date: '2026-11-04', patientEmail: 'other@example.com' });

		const byDoctor = await app.inject({ method: 'GET', url: `/api/appointments?doctorId=${doctors.cardio.id}` });
		expect(byDoctor.json()).toHaveLength(1);

		const tuesday = await app.inject({
			method: 'GET',
			url: '/api/appointments?from=2026-11-03T03:00:00Z&to=2026-11-04T03:00:00Z',
		});
		expect(tuesday.json().map((a: { startsAt: string }) => a.startsAt)).toEqual([
			'2026-11-03T13:00:00.000Z',
			'2026-11-03T14:00:00.000Z',
		]);
	});
});

describe('doctor routes', () => {
	it('lists doctors with HH:mm hours', async () => {
		const res = await app.inject({ method: 'GET', url: '/api/doctors' });

		expect(res.json()).toEqual([
			{
				id: doctors.gp.id,
				name: 'Dr. Ada General',
				specialty: 'General Practice',
				workStart: '09:00',
				workEnd: '17:00',
			},
			{ id: doctors.cardio.id, name: 'Dr. Bo Heart', specialty: 'Cardiology', workStart: '08:00', workEnd: '14:00' },
		]);
	});

	it('returns availability for a day', async () => {
		await book();

		const res = await app.inject({
			method: 'GET',
			url: `/api/doctors/${doctors.gp.id}/availability?date=2026-11-03&duration=60`,
		});

		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body).toMatchObject({ date: '2026-11-03', durationMinutes: 60 });
		expect(body.slots.map((s: { startTime: string }) => s.startTime).slice(0, 3)).toEqual(['09:00', '10:30', '10:45']);
	});

	it('returns 404 for an unknown doctor', async () => {
		const res = await app.inject({ method: 'GET', url: '/api/doctors/999/availability?date=2026-11-03' });

		expect(res.statusCode).toBe(404);
	});
});
