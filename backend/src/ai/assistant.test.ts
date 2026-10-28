import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, describe, expect, it } from 'vitest';
import type { App } from '~/app';
import type { Db } from '~/db/client';
import { appointments } from '~/db/schema';
import { createAppointment } from '~/domain/appointments';
import { createTestApp, TEST_NOW, TEST_TZ } from '~/test/helpers';

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>;

const usage: GenerateResult['usage'] = {
	inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
	outputTokens: { total: 10, text: 10, reasoning: undefined },
};

function toolCallStep(toolName: string, input: unknown): GenerateResult {
	return {
		content: [{ type: 'tool-call', toolCallId: `call-${toolName}`, toolName, input: JSON.stringify(input) }],
		finishReason: { unified: 'tool-calls', raw: 'tool_use' },
		usage,
		warnings: [],
	};
}

function textStep(json: unknown): GenerateResult {
	return {
		content: [{ type: 'text', text: JSON.stringify(json) }],
		finishReason: { unified: 'stop', raw: 'end_turn' },
		usage,
		warnings: [],
	};
}

const patient = { name: 'Ana Gómez', email: 'ana@example.com' };
// The GP is doctor 1 in a fresh test DB; Tuesday is the day after TEST_NOW.
const selection = { doctorId: 1, date: '2026-11-03', startTime: '10:00', durationMinutes: 30 };

describe('POST /api/assistant/chat', () => {
	let app: App;
	let db: Db;

	afterEach(async () => {
		await app.close();
	});

	function setup(steps: GenerateResult[]) {
		const model = new MockLanguageModelV4({ doGenerate: steps });
		({ app, db } = createTestApp({ model }));
		return model;
	}

	function bookingTurn() {
		return app.inject({
			method: 'POST',
			url: '/api/assistant/chat',
			payload: {
				messages: [{ role: 'user', content: 'Book Dr. Ada General on Tue 3 Nov at 10:00 (30 min)' }],
				patient,
				selection,
			},
		});
	}

	it('books the selected slot through the tool', async () => {
		setup([toolCallStep('createAppointment', selection), textStep({ message: 'Booked!', slots: [] })]);

		const res = await bookingTurn();

		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.message).toBe('Booked!');
		expect(body.appointment).toMatchObject({
			doctorId: selection.doctorId,
			patientEmail: patient.email,
			patientName: patient.name,
		});
		expect(db.select().from(appointments).all()).toHaveLength(1);
	});

	it('rejects a tool call that differs from the selection', async () => {
		const model = setup([
			toolCallStep('createAppointment', { ...selection, startTime: '11:00' }),
			textStep({ message: 'Booked!', slots: [] }),
		]);

		const res = await bookingTurn();

		expect(res.statusCode).toBe(200);
		expect(res.json().appointment).toBeNull();
		expect(db.select().from(appointments).all()).toHaveLength(0);
		expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).toContain('selection_mismatch');
	});

	it('does not offer the booking tool without a selection', async () => {
		const model = setup([textStep({ message: 'Which specialty do you need?', slots: [] })]);

		const res = await app.inject({
			method: 'POST',
			url: '/api/assistant/chat',
			payload: { messages: [{ role: 'user', content: 'I need an appointment' }], patient },
		});

		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ message: 'Which specialty do you need?', slots: [], appointment: null });
		const toolNames = (model.doGenerateCalls[0]?.tools ?? []).map(t => t.name);
		expect(toolNames).toEqual(expect.arrayContaining(['listDoctors', 'findAvailableSlots']));
		expect(toolNames).not.toContain('createAppointment');
	});

	it('reports a taken slot with suggestions instead of booking', async () => {
		const model = setup([
			toolCallStep('createAppointment', selection),
			textStep({ message: 'That slot was just taken.', slots: [] }),
		]);
		createAppointment(
			db,
			{ ...selection, patientName: 'Someone Else', patientEmail: 'else@example.com' },
			{ now: TEST_NOW, tz: TEST_TZ },
		);

		const res = await bookingTurn();

		expect(res.statusCode).toBe(200);
		expect(res.json().appointment).toBeNull();
		expect(db.select().from(appointments).all()).toHaveLength(1);
		const toolResult = JSON.stringify(model.doGenerateCalls[1]?.prompt);
		expect(toolResult).toContain('doctor_conflict');
		expect(toolResult).toContain('suggestions');
	});

	it('drops offered slots that are not actually free', async () => {
		setup([
			textStep({
				message: 'Here are some options.',
				slots: [
					{ doctorId: 1, doctorName: 'x', specialty: 'x', date: '2026-11-03', startTime: '10:00', durationMinutes: 30 },
					{ doctorId: 1, doctorName: 'x', specialty: 'x', date: '2026-11-03', startTime: '07:00', durationMinutes: 30 },
					{
						doctorId: 99,
						doctorName: 'x',
						specialty: 'x',
						date: '2026-11-03',
						startTime: '10:00',
						durationMinutes: 30,
					},
				],
			}),
		]);

		const res = await app.inject({
			method: 'POST',
			url: '/api/assistant/chat',
			payload: { messages: [{ role: 'user', content: 'GP tomorrow morning' }] },
		});

		expect(res.json().slots).toEqual([
			{
				doctorId: 1,
				doctorName: 'Dr. Ada General',
				specialty: 'General Practice',
				date: '2026-11-03',
				startTime: '10:00',
				durationMinutes: 30,
			},
		]);
	});

	it('returns 502 without provider details when the model fails', async () => {
		const model = new MockLanguageModelV4({
			doGenerate: async () => {
				throw new Error('secret provider failure');
			},
		});
		({ app } = createTestApp({ model }));

		const res = await app.inject({
			method: 'POST',
			url: '/api/assistant/chat',
			payload: { messages: [{ role: 'user', content: 'hi' }] },
		});

		expect(res.statusCode).toBe(502);
		expect(res.json().error).toBe('assistant_unavailable');
		expect(res.body).not.toContain('secret');
	});

	it('requires patient details with a selection', async () => {
		setup([]);

		const res = await app.inject({
			method: 'POST',
			url: '/api/assistant/chat',
			payload: { messages: [{ role: 'user', content: 'Book it' }], selection },
		});

		expect(res.statusCode).toBe(400);
	});

	it('is disabled without a model', async () => {
		({ app } = createTestApp({ model: null }));

		const chat = await app.inject({ method: 'POST', url: '/api/assistant/chat', payload: {} });
		const config = await app.inject({ method: 'GET', url: '/api/config' });

		expect(chat.statusCode).toBe(503);
		expect(chat.json().error).toBe('assistant_disabled');
		expect(config.json().aiEnabled).toBe(false);
	});
});
