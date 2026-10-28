import { afterEach, describe, expect, it } from 'vitest';
import { type App, buildApp } from '~/app';
import { loadConfig } from '~/config';

describe('GET /api/health', () => {
	let app: App;

	afterEach(async () => {
		await app.close();
	});

	it('returns ok', async () => {
		app = buildApp({ config: loadConfig({ LOG_LEVEL: 'silent' }) });

		const res = await app.inject({ method: 'GET', url: '/api/health' });

		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ ok: true });
	});
});
