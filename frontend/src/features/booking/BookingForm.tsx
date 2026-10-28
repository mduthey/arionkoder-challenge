import { useForm, useSelector } from '@tanstack/react-form';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel, FieldTitle } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Textarea } from '~/components/ui/textarea';
import { SlotPicker } from '~/features/booking/SlotPicker';
import { ApiError, type ConflictBody, type Doctor, isConflict, type Slot } from '~/lib/api';
import { formatDay, formatSlot, formatTime, todayInTz } from '~/lib/format';
import { useCreateAppointment } from '~/lib/queries';

const DURATIONS = [15, 30, 45, 60];

export function makeBookingSchema(today: string) {
	return z.object({
		doctorId: z.string().min(1, 'Choose a doctor'),
		date: z
			.string()
			.min(1, 'Choose a date')
			.refine(d => d >= today, 'Date must be today or later'),
		startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a start time'),
		durationMinutes: z.number().refine(d => DURATIONS.includes(d), 'Choose a duration'),
		patientName: z.string().trim().min(1, 'Enter the patient name').max(100, 'Keep it under 100 characters'),
		patientEmail: z.email('Enter a valid email'),
		reason: z.string().max(500, 'Keep it under 500 characters'),
	});
}

type BookingFormProps = {
	doctors: Doctor[];
	tz: string;
};

export function BookingForm({ doctors, tz }: BookingFormProps) {
	const today = todayInTz(tz);
	const bookingSchema = useMemo(() => makeBookingSchema(today), [today]);
	const createAppointment = useCreateAppointment();
	const submitRef = useRef<HTMLButtonElement>(null);
	const [conflict, setConflict] = useState<ConflictBody | null>(null);
	const [formError, setFormError] = useState<string | null>(null);

	const form = useForm({
		defaultValues: {
			doctorId: doctors[0] ? String(doctors[0].id) : '',
			date: today,
			startTime: '',
			durationMinutes: 30,
			patientName: '',
			patientEmail: '',
			reason: '',
		},
		validators: { onChange: bookingSchema },
		// A server error describes the values that were sent; drop it once they change.
		listeners: {
			onChange: () => {
				setConflict(null);
				setFormError(null);
			},
		},
		onSubmit: async ({ value, formApi }) => {
			setConflict(null);
			setFormError(null);
			try {
				const appointment = await createAppointment.mutateAsync({
					...value,
					doctorId: Number(value.doctorId),
					patientName: value.patientName.trim(),
					reason: value.reason.trim() || null,
				});
				toast.success(
					`Booked with ${appointment.doctorName} — ${formatDay(appointment.startsAt, tz)} ${formatTime(appointment.startsAt, tz)}`,
				);
				// Keep the original defaults, or the next render's `useForm` options would revert the untouched form to them.
				formApi.reset({ ...value, startTime: '', reason: '' }, { keepDefaultValues: true });
			} catch (err) {
				if (isConflict(err)) setConflict(err.body);
				else if (err instanceof ApiError && (err.status === 400 || err.status === 422)) setFormError(err.message);
				else toast.error(err instanceof Error ? err.message : 'Something went wrong');
			}
		},
	});

	const doctorId = useSelector(form.store, s => s.values.doctorId);
	const date = useSelector(form.store, s => s.values.date);
	const durationMinutes = useSelector(form.store, s => s.values.durationMinutes);
	const startTime = useSelector(form.store, s => s.values.startTime);
	const doctorNames = new Map(doctors.map(d => [d.id, d.name]));

	function pickSuggestion(slot: Slot) {
		form.setFieldValue('doctorId', String(slot.doctorId));
		form.setFieldValue('date', slot.date);
		form.setFieldValue('startTime', slot.startTime);
		setConflict(null);
		submitRef.current?.focus();
	}

	return (
		<form
			noValidate
			onSubmit={e => {
				e.preventDefault();
				void form.handleSubmit();
			}}
		>
			<FieldGroup>
				<form.Field name="doctorId">
					{field => {
						const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
						return (
							<Field data-invalid={isInvalid}>
								<FieldLabel htmlFor={field.name}>Doctor</FieldLabel>
								<Select name={field.name} value={field.state.value} onValueChange={field.handleChange}>
									<SelectTrigger id={field.name} aria-invalid={isInvalid} onBlur={field.handleBlur} className="w-full">
										<SelectValue placeholder="Choose a doctor" />
									</SelectTrigger>
									<SelectContent>
										{doctors.map(d => (
											<SelectItem key={d.id} value={String(d.id)}>
												{d.name} · {d.specialty}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						);
					}}
				</form.Field>

				<div className="grid gap-4 sm:grid-cols-3">
					<form.Field name="date">
						{field => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
							return (
								<Field data-invalid={isInvalid}>
									<FieldLabel htmlFor={field.name}>Date</FieldLabel>
									<Input
										id={field.name}
										name={field.name}
										type="date"
										min={today}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={e => field.handleChange(e.target.value)}
										aria-invalid={isInvalid}
									/>
									{isInvalid && <FieldError errors={field.state.meta.errors} />}
								</Field>
							);
						}}
					</form.Field>

					<form.Field name="startTime">
						{field => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
							return (
								<Field data-invalid={isInvalid}>
									<FieldLabel htmlFor={field.name}>Start time</FieldLabel>
									<Input
										id={field.name}
										name={field.name}
										type="time"
										step={900}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={e => field.handleChange(e.target.value)}
										aria-invalid={isInvalid}
									/>
									{isInvalid && <FieldError errors={field.state.meta.errors} />}
								</Field>
							);
						}}
					</form.Field>

					<form.Field name="durationMinutes">
						{field => (
							<Field>
								<FieldLabel htmlFor={field.name}>Duration</FieldLabel>
								<Select
									name={field.name}
									value={String(field.state.value)}
									onValueChange={v => field.handleChange(Number(v))}
								>
									<SelectTrigger id={field.name} className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{DURATIONS.map(d => (
											<SelectItem key={d} value={String(d)}>
												{d} min
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						)}
					</form.Field>
				</div>

				<Field>
					<FieldTitle>Free slots</FieldTitle>
					<SlotPicker
						doctorId={doctorId ? Number(doctorId) : undefined}
						date={date >= today ? date : undefined}
						durationMinutes={durationMinutes}
						selected={startTime}
						onPick={t => form.setFieldValue('startTime', t)}
					/>
				</Field>

				<div className="grid gap-4 sm:grid-cols-2">
					<form.Field name="patientName">
						{field => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
							return (
								<Field data-invalid={isInvalid}>
									<FieldLabel htmlFor={field.name}>Patient name</FieldLabel>
									<Input
										id={field.name}
										name={field.name}
										autoComplete="name"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={e => field.handleChange(e.target.value)}
										aria-invalid={isInvalid}
									/>
									{isInvalid && <FieldError errors={field.state.meta.errors} />}
								</Field>
							);
						}}
					</form.Field>

					<form.Field name="patientEmail">
						{field => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
							return (
								<Field data-invalid={isInvalid}>
									<FieldLabel htmlFor={field.name}>Email</FieldLabel>
									<Input
										id={field.name}
										name={field.name}
										type="email"
										autoComplete="email"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={e => field.handleChange(e.target.value)}
										aria-invalid={isInvalid}
									/>
									{isInvalid && <FieldError errors={field.state.meta.errors} />}
								</Field>
							);
						}}
					</form.Field>
				</div>

				<form.Field name="reason">
					{field => {
						const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
						return (
							<Field data-invalid={isInvalid}>
								<FieldLabel htmlFor={field.name}>Reason (optional)</FieldLabel>
								<Textarea
									id={field.name}
									name={field.name}
									rows={3}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={e => field.handleChange(e.target.value)}
									aria-invalid={isInvalid}
								/>
								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						);
					}}
				</form.Field>

				{conflict && (
					<Alert variant="destructive">
						<AlertTitle>That time isn't available</AlertTitle>
						<AlertDescription>
							<p>{conflict.message}</p>
							{conflict.suggestions.length > 0 && (
								<ul aria-label="Suggested slots" className="mt-2 flex flex-wrap gap-2">
									{conflict.suggestions.map(slot => (
										<li key={`${slot.doctorId}-${slot.startsAt}`}>
											<Button type="button" size="sm" variant="outline" onClick={() => pickSuggestion(slot)}>
												{formatSlot(slot.startsAt, tz)}
												{slot.doctorId !== Number(doctorId) && ` · ${doctorNames.get(slot.doctorId)}`}
											</Button>
										</li>
									))}
								</ul>
							)}
						</AlertDescription>
					</Alert>
				)}

				{formError && (
					<Alert variant="destructive">
						<AlertTitle>Couldn't book</AlertTitle>
						<AlertDescription>{formError}</AlertDescription>
					</Alert>
				)}

				<form.Subscribe selector={s => [s.canSubmit, s.isSubmitting] as const}>
					{([canSubmit, isSubmitting]) => (
						<Button ref={submitRef} type="submit" size="lg" disabled={!canSubmit || isSubmitting}>
							{isSubmitting ? 'Booking…' : 'Book appointment'}
						</Button>
					)}
				</form.Subscribe>
			</FieldGroup>
		</form>
	);
}
