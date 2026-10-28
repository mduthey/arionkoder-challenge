import { TZDate } from '@date-fns/tz';

export const DURATIONS = [15, 30, 45, 60] as const;
export type Duration = (typeof DURATIONS)[number];
export const SLOT_STEP = 15;

export type Interval = { start: number; end: number };

/** Half-open intervals: back-to-back (touching) intervals do not overlap. */
export function overlaps(a: Interval, b: Interval) {
	return a.start < b.end && a.end > b.start;
}

export function isDuration(value: number): value is Duration {
	return (DURATIONS as readonly number[]).includes(value);
}

/** Clinic-local `YYYY-MM-DD` + `HH:mm` → UTC instant. Out-of-range parts roll over; callers round-trip to validate. */
export function clinicToUtc(date: string, time: string, tz: string): Date {
	const [y = Number.NaN, m = Number.NaN, d = Number.NaN] = date.split('-').map(Number);
	const [hh = Number.NaN, mm = Number.NaN] = time.split(':').map(Number);
	return new Date(new TZDate(y, m - 1, d, hh, mm, tz).getTime());
}

export type ClinicTime = {
	date: string;
	time: string;
	/** ISO weekday: 1 = Monday … 7 = Sunday. */
	weekday: number;
	minuteOfDay: number;
};

export function utcToClinic(ms: number, tz: string): ClinicTime {
	const local = new TZDate(ms, tz);
	const date = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
	const hours = local.getHours();
	const minutes = local.getMinutes();
	return {
		date,
		time: `${pad(hours)}:${pad(minutes)}`,
		weekday: local.getDay() === 0 ? 7 : local.getDay(),
		minuteOfDay: hours * 60 + minutes,
	};
}

export function isWeekday(weekday: number) {
	return weekday >= 1 && weekday <= 5;
}

/** ISO weekday of a calendar date, independent of any timezone. */
export function weekdayOf(date: string) {
	const day = new Date(`${date}T00:00:00Z`).getUTCDay();
	return day === 0 ? 7 : day;
}

export function addDays(date: string, days: number) {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

export function isValidDate(date: string) {
	const d = new Date(`${date}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

export function minuteToTime(minute: number) {
	return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

export function timeToMinute(time: string) {
	const [hh = Number.NaN, mm = Number.NaN] = time.split(':').map(Number);
	return hh * 60 + mm;
}

function pad(n: number) {
	return String(n).padStart(2, '0');
}
