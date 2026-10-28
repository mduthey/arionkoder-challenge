import { buildApp } from '~/app';
import { loadConfig } from '~/config';
import { createDb } from '~/db/client';
import { runMigrations } from '~/db/migrations';
import { seed } from '~/db/seed';

const config = loadConfig();
const db = createDb(config.databaseUrl);

// Local dev just works; in production the `migrate` entry (dist/migrate.js) owns this.
if (process.env.NODE_ENV !== 'production') {
	runMigrations(db, config.migrationsDir);
	seed(db, { now: new Date(), tz: config.clinicTimezone });
}

const app = buildApp({ config, db, now: () => new Date() });
app.addHook('onClose', async () => db.$client.close());

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.once(signal, () => {
		app.log.info({ signal }, 'shutting down');
		app.close().then(
			() => process.exit(0),
			err => {
				app.log.error({ err }, 'shutdown failed');
				process.exit(1);
			},
		);
	});
}

await app.listen({ port: config.port, host: config.host });
