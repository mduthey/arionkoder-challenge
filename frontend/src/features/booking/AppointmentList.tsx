import { toast } from 'sonner';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import type { Appointment } from '~/lib/api';
import { dateInTz, formatDay, formatRange, formatTime } from '~/lib/format';
import { useAppointments, useCancelAppointment } from '~/lib/queries';

export function AppointmentList({ tz }: { tz: string }) {
	const appointments = useAppointments();
	const cancel = useCancelAppointment();

	if (appointments.isPending) {
		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-14 w-full" />
				<Skeleton className="h-14 w-full" />
			</div>
		);
	}
	if (appointments.isError) {
		return (
			<Alert variant="destructive">
				<AlertDescription>Couldn't load appointments: {appointments.error.message}</AlertDescription>
			</Alert>
		);
	}
	if (appointments.data.length === 0) {
		return <p className="py-6 text-center text-muted-foreground text-sm">No upcoming appointments.</p>;
	}

	const onCancel = (a: Appointment) =>
		cancel.mutate(a.id, {
			onSuccess: () => toast.success(`Cancelled ${a.patientName} — ${formatRange(a.startsAt, a.endsAt, tz)}`),
			onError: err => toast.error(err.message),
		});

	return (
		<div className="flex flex-col gap-6">
			{groupByDay(appointments.data, tz).map(({ day, label, items }) => (
				<section key={day} aria-label={label}>
					<h3 className="mb-2 font-medium text-muted-foreground text-sm">{label}</h3>
					<ul className="divide-y rounded-lg border">
						{items.map(a => (
							<li key={a.id} className="flex items-start justify-between gap-4 p-3">
								<div className="min-w-0 text-sm">
									<p className="font-medium tabular-nums">
										{formatTime(a.startsAt, tz)}–{formatTime(a.endsAt, tz)}
									</p>
									<p>
										{a.doctorName} <span className="text-muted-foreground">· {a.specialty}</span>
									</p>
									<p className="text-muted-foreground">
										{a.patientName}
										{a.reason && ` — ${a.reason}`}
									</p>
								</div>
								<Button
									variant="ghost"
									size="sm"
									disabled={cancel.isPending && cancel.variables === a.id}
									onClick={() => onCancel(a)}
								>
									Cancel
								</Button>
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}

function groupByDay(appointments: Appointment[], tz: string) {
	const groups = new Map<string, { day: string; label: string; items: Appointment[] }>();
	for (const a of [...appointments].sort((x, y) => x.startsAt.localeCompare(y.startsAt))) {
		const day = dateInTz(a.startsAt, tz);
		const group = groups.get(day) ?? { day, label: formatDay(a.startsAt, tz), items: [] };
		group.items.push(a);
		groups.set(day, group);
	}
	return [...groups.values()];
}
