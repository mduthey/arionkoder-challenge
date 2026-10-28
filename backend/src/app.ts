import type { LanguageModel } from 'ai';
import Fastify from 'fastify';
import {
	hasZodFastifySchemaValidationErrors,
	serializerCompiler,
	validatorCompiler,
	type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { AssistantError } from '~/ai/assistant';
import type { Config } from '~/config';
import type { Db } from '~/db/client';
import { DomainError } from '~/domain/errors';
import { appointmentRoutes } from '~/routes/appointments';
import { assistantRoutes } from '~/routes/assistant';
import { configRoutes } from '~/routes/config';
import { doctorRoutes } from '~/routes/doctors';
import { healthRoutes } from '~/routes/health';

export type AppDeps = {
	config: Config;
	db: Db;
	/** `null` disables the assistant (no AI Gateway key). */
	model: LanguageModel | null;
	/** Injectable clock so tests are deterministic. */
	now: () => Date;
};

export function buildApp(deps: AppDeps) {
	const { config } = deps;
	const app = Fastify({ logger: { level: config.logLevel } }).withTypeProvider<ZodTypeProvider>();

	app.setValidatorCompiler(validatorCompiler);
	app.setSerializerCompiler(serializerCompiler);

	app.setErrorHandler((err, request, reply) => {
		if (hasZodFastifySchemaValidationErrors(err)) {
			return reply.status(400).send({ error: 'validation', issues: err.validation });
		}
		if (err instanceof DomainError) {
			return reply.status(err.status).send({ error: err.code, message: err.message, ...err.details });
		}
		if (err instanceof AssistantError) {
			// The cause may carry provider details; log it, never send it.
			request.log.error({ err: err.cause ?? err }, 'assistant error');
			return reply.status(502).send({ error: err.code, message: err.message });
		}
		// Fastify's own client errors (malformed JSON, oversized body, …) keep their status.
		if (isClientError(err)) {
			return reply.status(err.statusCode).send({ error: 'bad_request', message: err.message });
		}
		request.log.error({ err }, 'unhandled error');
		return reply.status(500).send({ error: 'internal' });
	});

	app.register(healthRoutes, { prefix: '/api' });
	app.register(configRoutes, { prefix: '/api', ...deps });
	app.register(doctorRoutes, { prefix: '/api', ...deps });
	app.register(appointmentRoutes, { prefix: '/api', ...deps });
	app.register(assistantRoutes, { prefix: '/api', ...deps });

	return app;
}

function isClientError(err: unknown): err is Error & { statusCode: number } {
	return err instanceof Error && 'statusCode' in err && typeof err.statusCode === 'number' && err.statusCode < 500;
}

export type App = ReturnType<typeof buildApp>;
