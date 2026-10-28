// DTOs mirror the backend responses. They are kept local on purpose instead of sharing a package.
export type Doctor = {
	id: number;
	name: string;
	specialty: string;
	workStart: string;
	workEnd: string;
};

export type Slot = {
	doctorId: number;
	date: string;
	startTime: string;
	durationMinutes: number;
	startsAt: string;
};

export type Availability = {
	date: string;
	durationMinutes: number;
	slots: Slot[];
};

export type Appointment = {
	id: number;
	doctorId: number;
	doctorName: string;
	specialty: string;
	patientName: string;
	patientEmail: string;
	startsAt: string;
	endsAt: string;
	reason: string | null;
	status: 'scheduled' | 'cancelled';
};

export type ConflictBody = {
	error: 'doctor_conflict' | 'patient_conflict';
	message: string;
	suggestions: Slot[];
};

export type AppConfig = {
	clinicTimezone: string;
	aiEnabled?: boolean;
};

export type CreateAppointmentInput = {
	doctorId: number;
	date: string;
	startTime: string;
	durationMinutes: number;
	patientName: string;
	patientEmail: string;
	reason?: string | null;
};

type ErrorBody = { error?: string; message?: string } & Record<string, unknown>;

export class ApiError extends Error {
	readonly status: number;
	readonly code: string;
	readonly body: ErrorBody;

	constructor(status: number, body: ErrorBody) {
		super(body.message ?? defaultMessage(status, body.error));
		this.name = 'ApiError';
		this.status = status;
		this.code = body.error ?? 'unknown';
		this.body = body;
	}
}

function defaultMessage(status: number, code?: string) {
	if (code === 'validation') return 'Some fields are invalid. Please check the form.';
	return `Request failed (${status})`;
}

export function isConflict(err: unknown): err is ApiError & { body: ConflictBody } {
	return err instanceof ApiError && err.status === 409;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`/api${path}`, {
		...init,
		headers: {
			Accept: 'application/json',
			...(init?.body ? { 'Content-Type': 'application/json' } : {}),
			...init?.headers,
		},
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new ApiError(res.status, body);
	return body as T;
}

export const getConfig = () => apiFetch<AppConfig>('/config');

export const getDoctors = () => apiFetch<Doctor[]>('/doctors');

export const getAvailability = (doctorId: number, date: string, duration: number) =>
	apiFetch<Availability>(
		`/doctors/${doctorId}/availability?${new URLSearchParams({ date, duration: String(duration) })}`,
	);

export const getAppointments = () => apiFetch<Appointment[]>('/appointments');

export const createAppointment = (input: CreateAppointmentInput) =>
	apiFetch<Appointment>('/appointments', { method: 'POST', body: JSON.stringify(input) });

export const cancelAppointment = (id: number) =>
	apiFetch<Appointment>(`/appointments/${id}/cancel`, { method: 'POST' });
