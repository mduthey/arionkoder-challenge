import { resolve } from 'node:path';
import type { LanguageModel } from 'ai';
import { buildApp } from '~/app';
import { loadConfig } from '~/config';
import { createDb } from '~/db/client';
import { runMigrations } from '~/db/migrations';
import { doctors } from '~/db/schema';

export const TEST_TZ = 'America/Argentina/Buenos_Aires';
/** Monday 2026-11-02 08:00 in Buenos Aires (UTC−3). */
export const TEST_NOW = new Date('2026-11-02T11:00:00.000Z');

const MIGRATIONS_DIR = resolve(import.meta.dirname, '../../drizzle');

export function createTestDb() {
	const db = createDb(':memory:');
	runMigrations(db, MIGRATIONS_DIR);
	const [gp, cardio] = db
		.insert(doctors)
		.values([
			{ name: 'Dr. Ada General', specialty: 'General Practice', workStartMinute: 9 * 60, workEndMinute: 17 * 60 },
			{ name: 'Dr. Bo Heart', specialty: 'Cardiology', workStartMinute: 8 * 60, workEndMinute: 14 * 60 },
		])
		.returning()
		.all();
	if (!gp || !cardio) throw new Error('failed to insert test doctors');
	return { db, doctors: { gp, cardio } };
}

export function createTestApp({ now = TEST_NOW, model = null }: { now?: Date; model?: LanguageModel | null } = {}) {
	const { db, doctors } = createTestDb();
	const config = loadConfig({ LOG_LEVEL: 'silent', DATABASE_URL: ':memory:', CLINIC_TIMEZONE: TEST_TZ });
	const app = buildApp({ config, db, model, now: () => now });
	app.addHook('onClose', async () => db.$client.close());
	return { app, db, doctors };
}
