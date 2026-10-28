import { describe, expect, it } from 'vitest';
import { clinicToUtc, overlaps, utcToClinic } from '~/domain/time';

const TZ = 'America/Argentina/Buenos_Aires';

describe('overlaps', () => {
	const a = { start: 10, end: 20 };

	it('is false for touching intervals', () => {
		expect(overlaps(a, { start: 20, end: 30 })).toBe(false);
		expect(overlaps(a, { start: 0, end: 10 })).toBe(false);
	});

	it('is true for contained, partial and identical intervals', () => {
		expect(overlaps(a, { start: 12, end: 18 })).toBe(true);
		expect(overlaps(a, { start: 5, end: 15 })).toBe(true);
		expect(overlaps(a, { start: 15, end: 25 })).toBe(true);
		expect(overlaps(a, { start: 10, end: 20 })).toBe(true);
	});
});

describe('clinic time conversion', () => {
	it('converts clinic-local time to UTC', () => {
		expect(clinicToUtc('2026-11-02', '08:00', TZ).toISOString()).toBe('2026-11-02T11:00:00.000Z');
	});

	it('round-trips', () => {
		const utc = clinicToUtc('2026-11-06', '16:45', TZ);
		expect(utcToClinic(utc.getTime(), TZ)).toEqual({
			date: '2026-11-06',
			time: '16:45',
			weekday: 5,
			minuteOfDay: 16 * 60 + 45,
		});
	});

	it('reports the clinic-local date across the UTC day boundary', () => {
		expect(utcToClinic(Date.parse('2026-11-08T01:30:00Z'), TZ)).toMatchObject({ date: '2026-11-07', weekday: 6 });
	});
});
