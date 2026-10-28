export const domainErrorStatus = {
	not_found: 404,
	invalid_time: 422,
	outside_hours: 422,
	doctor_conflict: 409,
	patient_conflict: 409,
} as const;

export type DomainErrorCode = keyof typeof domainErrorStatus;

export class DomainError extends Error {
	readonly code: DomainErrorCode;
	readonly status: number;
	readonly details: Record<string, unknown>;

	constructor(code: DomainErrorCode, message: string, details: Record<string, unknown> = {}) {
		super(message);
		this.name = 'DomainError';
		this.code = code;
		this.status = domainErrorStatus[code];
		this.details = details;
	}
}
