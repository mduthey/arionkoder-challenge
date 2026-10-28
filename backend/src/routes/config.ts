import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppDeps } from '~/app';

export const configRoutes: FastifyPluginAsyncZod<AppDeps> = async (app, { config }) => {
	app.get('/config', { schema: { response: { 200: z.object({ clinicTimezone: z.string() }) } } }, async () => ({
		clinicTimezone: config.clinicTimezone,
	}));
};
