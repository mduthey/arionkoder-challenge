import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppDeps } from '~/app';
import { doctors } from '~/db/schema';
import { findFreeSlots } from '~/domain/availability';
import { minuteToTime } from '~/domain/time';
import { dateSchema, idSchema, slotSchema } from '~/routes/schemas';

const doctorSchema = z.object({
	id: z.number(),
	name: z.string(),
	specialty: z.string(),
	workStart: z.string(),
	workEnd: z.string(),
});

export const doctorRoutes: FastifyPluginAsyncZod<AppDeps> = async (app, { db, config, now }) => {
	app.get('/doctors', { schema: { response: { 200: z.array(doctorSchema) } } }, async () =>
		db
			.select()
			.from(doctors)
			.orderBy(doctors.id)
			.all()
			.map(d => ({
				id: d.id,
				name: d.name,
				specialty: d.specialty,
				workStart: minuteToTime(d.workStartMinute),
				workEnd: minuteToTime(d.workEndMinute),
			})),
	);

	app.get(
		'/doctors/:id/availability',
		{
			schema: {
				params: z.object({ id: idSchema }),
				querystring: z.object({ date: dateSchema, duration: z.coerce.number().int().default(30) }),
				response: {
					200: z.object({ date: z.string(), durationMinutes: z.number(), slots: z.array(slotSchema) }),
				},
			},
		},
		async ({ params, query }) => ({
			date: query.date,
			durationMinutes: query.duration,
			slots: findFreeSlots(db, {
				doctorId: params.id,
				date: query.date,
				durationMinutes: query.duration,
				now: now(),
				tz: config.clinicTimezone,
			}),
		}),
	);
};
