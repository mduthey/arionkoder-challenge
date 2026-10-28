import { buildApp } from '~/app';
import { loadConfig } from '~/config';

const config = loadConfig();
const app = buildApp({ config });

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
