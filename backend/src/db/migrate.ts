import { loadConfig } from '~/config';
import { createDb } from '~/db/client';
import { runMigrations } from '~/db/migrations';
import { seed } from '~/db/seed';

const config = loadConfig();
const db = createDb(config.databaseUrl);

runMigrations(db, config.migrationsDir);
console.log(`migrations applied from ${config.migrationsDir} to ${config.databaseUrl}`);

const result = seed(db, { now: new Date(), tz: config.clinicTimezone });
console.log(
	result.seeded
		? `seeded ${result.doctors} doctors and ${result.appointments} appointments`
		: 'seed skipped: doctors already exist',
);

db.$client.close();
