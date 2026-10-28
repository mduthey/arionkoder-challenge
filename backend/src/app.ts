import Fastify from 'fastify';
import {
	hasZodFastifySchemaValidationErrors,
	serializerCompiler,
	validatorCompiler,
	type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Config } from '~/config';
import { healthRoutes } from '~/routes/health';

export type AppDeps = {
	config: Config;
};

export function buildApp({ config }: AppDeps) {
	const app = Fastify({ logger: { level: config.logLevel } }).withTypeProvider<ZodTypeProvider>();

	app.setValidatorCompiler(validatorCompiler);
	app.setSerializerCompiler(serializerCompiler);

	app.setErrorHandler((err, request, reply) => {
		if (hasZodFastifySchemaValidationErrors(err)) {
			return reply.status(400).send({ error: 'validation', issues: err.validation });
		}
		// Fastify's own client errors (malformed JSON, oversized body, …) keep their status.
		if (isClientError(err)) {
			return reply.status(err.statusCode).send({ error: 'bad_request', message: err.message });
		}
		request.log.error({ err }, 'unhandled error');
		return reply.status(500).send({ error: 'internal' });
	});

	app.register(healthRoutes, { prefix: '/api' });

	return app;
}

function isClientError(err: unknown): err is Error & { statusCode: number } {
	return err instanceof Error && 'statusCode' in err && typeof err.statusCode === 'number' && err.statusCode < 500;
}

export type App = ReturnType<typeof buildApp>;
