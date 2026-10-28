import { z } from 'zod';

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Expected HH:mm');
export const idSchema = z.coerce.number().int().positive();

export const slotSchema = z.object({
	doctorId: z.number(),
	date: z.string(),
	startTime: z.string(),
	durationMinutes: z.number(),
	startsAt: z.string(),
});

export const appointmentSchema = z.object({
	id: z.number(),
	doctorId: z.number(),
	doctorName: z.string(),
	specialty: z.string(),
	patientName: z.string(),
	patientEmail: z.string(),
	startsAt: z.string(),
	endsAt: z.string(),
	reason: z.string().nullable(),
	status: z.enum(['scheduled', 'cancelled']),
});
