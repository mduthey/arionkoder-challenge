import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { useAvailability } from '~/lib/queries';

type SlotPickerProps = {
	doctorId?: number;
	date?: string;
	durationMinutes: number;
	selected?: string;
	onPick: (startTime: string) => void;
};

export function SlotPicker({ doctorId, date, durationMinutes, selected, onPick }: SlotPickerProps) {
	const availability = useAvailability(doctorId, date, durationMinutes);

	if (!doctorId || !date) {
		return <p className="text-muted-foreground text-sm">Pick a doctor and a date to see free slots.</p>;
	}
	if (availability.isPending) {
		return <Skeleton className="h-8 w-full" />;
	}
	if (availability.isError) {
		return <p className="text-destructive text-sm">Couldn't load availability.</p>;
	}

	const { slots } = availability.data;
	if (slots.length === 0) {
		return <p className="text-muted-foreground text-sm">No free slots that day</p>;
	}

	return (
		<ul aria-label="Free slots" className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
			{slots.map(slot => (
				<li key={slot.startsAt}>
					<Button
						type="button"
						size="sm"
						variant={slot.startTime === selected ? 'default' : 'outline'}
						aria-pressed={slot.startTime === selected}
						onClick={() => onPick(slot.startTime)}
					>
						{slot.startTime}
					</Button>
				</li>
			))}
		</ul>
	);
}
