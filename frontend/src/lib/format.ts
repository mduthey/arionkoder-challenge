const dayFormat = (tz: string) =>
	new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' });

const timeFormat = (tz: string) =>
	new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "Tue 3 Nov" */
export function formatDay(isoOrDate: string | Date, tz: string) {
	return dayFormat(tz).format(new Date(isoOrDate));
}

/** "14:30" */
export function formatTime(isoOrDate: string | Date, tz: string) {
	return timeFormat(tz).format(new Date(isoOrDate));
}

/** "Tue 3 Nov, 14:30" */
export function formatSlot(isoOrDate: string | Date, tz: string) {
	return `${formatDay(isoOrDate, tz)}, ${formatTime(isoOrDate, tz)}`;
}

/** "Tue 3 Nov, 14:30–15:00" */
export function formatRange(startIso: string, endIso: string, tz: string) {
	return `${formatSlot(startIso, tz)}–${formatTime(endIso, tz)}`;
}

/** Calendar date (`YYYY-MM-DD`) of an instant in the given time zone. */
export function dateInTz(isoOrDate: string | Date, tz: string) {
	return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(isoOrDate));
}

export function todayInTz(tz: string) {
	return dateInTz(new Date(), tz);
}
