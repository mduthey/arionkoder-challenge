import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { runAssistant } from '~/ai/assistant';
import { chatRequestSchema, chatResponseSchema } from '~/ai/schemas';
import type { AppDeps } from '~/app';

export const assistantRoutes: FastifyPluginAsyncZod<AppDeps> = async (app, { db, config, model, now }) => {
	if (model === null) {
		// No body validation here: without a model every request gets the same answer.
		app.post('/assistant/chat', async (_request, reply) =>
			reply
				.status(503)
				.send({ error: 'assistant_disabled', message: 'Set AI_GATEWAY_API_KEY to enable the assistant.' }),
		);
		return;
	}

	app.post(
		'/assistant/chat',
		{ schema: { body: chatRequestSchema, response: { 200: chatResponseSchema } } },
		async request => runAssistant({ model, db, config, now: now(), request: request.body }),
	);
};
