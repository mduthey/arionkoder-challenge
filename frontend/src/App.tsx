import { Button } from '~/components/ui/button';

export default function App() {
	return (
		<main className="mx-auto flex min-h-svh max-w-3xl flex-col items-start gap-4 p-8">
			<h1 className="font-semibold text-3xl tracking-tight">Clinic Booking</h1>
			<Button>Book an appointment</Button>
		</main>
	);
}
