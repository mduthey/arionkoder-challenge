import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppDeps } from '~/app';
import { cancelAppointment, createAppointment, listAppointments } from '~/domain/appointments';
import { appointmentSchema, dateSchema, idSchema, timeSchema } from '~/routes/schemas';

const isoDateTime = z.iso.datetime({ offset: true }).transform(s => new Date(s));

const createBodySchema = z.object({
	doctorId: z.number().int().positive(),
	date: dateSchema,
	startTime: timeSchema,
	durationMinutes: z.number().int(),
	patientName: z.string().trim().min(1).max(100),
	patientEmail: z.email().max(254),
	reason: z.string().trim().max(500).nullish(),
});

export const appointmentRoutes: FastifyPluginAsyncZod<AppDeps> = async (app, { db, config, now }) => {
	app.get(
		'/appointments',
		{
			schema: {
				querystring: z.object({
					doctorId: idSchema.optional(),
					from: isoDateTime.optional(),
					to: isoDateTime.optional(),
				}),
				response: { 200: z.array(appointmentSchema) },
			},
		},
		async ({ query }) => listAppointments(db, { doctorId: query.doctorId, from: query.from ?? now(), to: query.to }),
	);

	app.post(
		'/appointments',
		{ schema: { body: createBodySchema, response: { 201: appointmentSchema } } },
		async (request, reply) => {
			const appointment = createAppointment(db, request.body, { now: now(), tz: config.clinicTimezone });
			return reply.status(201).send(appointment);
		},
	);

	app.post(
		'/appointments/:id/cancel',
		{ schema: { params: z.object({ id: idSchema }), response: { 200: appointmentSchema } } },
		async ({ params }) => cancelAppointment(db, params.id),
	);
};
