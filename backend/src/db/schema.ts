import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Self-contained (no `~` imports): drizzle-kit loads this file directly.

export const doctors = sqliteTable('doctors', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	specialty: text('specialty').notNull(),
	workStartMinute: integer('work_start_minute').notNull(),
	workEndMinute: integer('work_end_minute').notNull(),
});

export const appointmentStatuses = ['scheduled', 'cancelled'] as const;

export const appointments = sqliteTable(
	'appointments',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		doctorId: integer('doctor_id')
			.notNull()
			.references(() => doctors.id),
		patientName: text('patient_name').notNull(),
		// Stored lowercase so the patient overlap check is case-insensitive.
		patientEmail: text('patient_email').notNull(),
		startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
		endsAt: integer('ends_at', { mode: 'timestamp_ms' }).notNull(),
		reason: text('reason'),
		status: text('status', { enum: appointmentStatuses }).notNull().default('scheduled'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	t => [
		index('appointments_doctor_starts_idx').on(t.doctorId, t.startsAt),
		index('appointments_patient_starts_idx').on(t.patientEmail, t.startsAt),
	],
);

export type DoctorRow = typeof doctors.$inferSelect;
export type AppointmentRow = typeof appointments.$inferSelect;
export type NewAppointmentRow = typeof appointments.$inferInsert;
