import { afterEach, describe, expect, it } from 'vitest';
import type { App } from '~/app';
import { createTestApp } from '~/test/helpers';

describe('GET /api/health', () => {
	let app: App;

	afterEach(async () => {
		await app.close();
	});

	it('returns ok', async () => {
		({ app } = createTestApp());

		const res = await app.inject({ method: 'GET', url: '/api/health' });

		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ ok: true });
	});

	it('exposes the clinic timezone', async () => {
		({ app } = createTestApp());

		const res = await app.inject({ method: 'GET', url: '/api/config' });

		expect(res.json()).toEqual({ clinicTimezone: 'America/Argentina/Buenos_Aires' });
	});
});
