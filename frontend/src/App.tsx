import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { AppointmentList } from '~/features/booking/AppointmentList';
import { BookingForm } from '~/features/booking/BookingForm';
import { useConfig, useDoctors } from '~/lib/queries';

export default function App() {
	const config = useConfig();
	const doctors = useDoctors();

	return (
		<div className="min-h-svh bg-muted/40">
			<main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
				<header>
					<h1 className="font-semibold text-3xl tracking-tight">Clinic Booking</h1>
					<p className="mt-1 text-muted-foreground">
						Book a visit with one of our doctors and manage upcoming appointments.
					</p>
				</header>

				{config.isError || doctors.isError ? (
					<Alert variant="destructive">
						<AlertTitle>Couldn't reach the clinic</AlertTitle>
						<AlertDescription>{(config.error ?? doctors.error)?.message}. Please try again later.</AlertDescription>
					</Alert>
				) : !config.data || !doctors.data ? (
					<div className="grid gap-6 lg:grid-cols-2">
						<Skeleton className="h-[32rem] w-full rounded-xl" />
					</div>
				) : (
					<>
						<div className="grid items-start gap-6 lg:grid-cols-2">
							<Card>
								<CardHeader>
									<CardTitle>Book an appointment</CardTitle>
									<CardDescription>Pick a free slot or enter a time.</CardDescription>
								</CardHeader>
								<CardContent>
									<BookingForm doctors={doctors.data} tz={config.data.clinicTimezone} />
								</CardContent>
							</Card>
							{/* The assistant panel goes in the right column. */}
						</div>

						<Card>
							<CardHeader>
								<CardTitle>Upcoming appointments</CardTitle>
								<CardDescription>
									Times are shown in the clinic's time zone ({config.data.clinicTimezone}).
								</CardDescription>
							</CardHeader>
							<CardContent>
								<AppointmentList tz={config.data.clinicTimezone} />
							</CardContent>
						</Card>
					</>
				)}
			</main>
		</div>
	);
}
