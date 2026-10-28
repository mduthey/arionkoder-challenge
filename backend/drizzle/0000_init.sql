CREATE TABLE `appointments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`doctor_id` integer NOT NULL,
	`patient_name` text NOT NULL,
	`patient_email` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`reason` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `appointments_doctor_starts_idx` ON `appointments` (`doctor_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `appointments_patient_starts_idx` ON `appointments` (`patient_email`,`starts_at`);--> statement-breakpoint
CREATE TABLE `doctors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`specialty` text NOT NULL,
	`work_start_minute` integer NOT NULL,
	`work_end_minute` integer NOT NULL
);
