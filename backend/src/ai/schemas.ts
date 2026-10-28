import { z } from 'zod';
import { appointmentSchema, dateSchema, timeSchema } from '~/routes/schemas';

export const chatMessageSchema = z.object({
	role: z.enum(['user', 'assistant']),
	content: z.string().min(1).max(2000),
});

export const patientSchema = z.object({
	name: z.string().trim().min(1).max(100),
	email: z.email().max(254),
});

/** The slot card the user clicked. Only this exact slot may be booked on that turn. */
export const selectionSchema = z.object({
	doctorId: z.number().int().positive(),
	date: dateSchema,
	startTime: timeSchema,
	durationMinutes: z.number().int(),
});

export const chatRequestSchema = z
	.object({
		messages: z.array(chatMessageSchema).min(1).max(20),
		patient: patientSchema.optional(),
		selection: selectionSchema.optional(),
	})
	.refine(r => !r.selection || r.patient, { message: 'A selection requires patient details', path: ['patient'] });

export const slotOptionSchema = z.object({
	doctorId: z.number().int(),
	doctorName: z.string(),
	specialty: z.string(),
	date: z.string().describe('YYYY-MM-DD'),
	startTime: z.string().describe('HH:mm, clinic time'),
	durationMinutes: z.number().int(),
});

/** Structured output of the model. `slots` is always present (empty when there are none) to keep it simple. */
export const assistantReplySchema = z.object({
	message: z.string().describe('Short reply to the user, plain text.'),
	slots: z.array(slotOptionSchema).describe('Slots to show as cards, copied from findAvailableSlots results.'),
});

export const chatResponseSchema = z.object({
	message: z.string(),
	slots: z.array(slotOptionSchema),
	appointment: appointmentSchema.nullable(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type Patient = z.infer<typeof patientSchema>;
export type Selection = z.infer<typeof selectionSchema>;
export type SlotOption = z.infer<typeof slotOptionSchema>;
