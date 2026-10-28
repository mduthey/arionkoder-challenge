import { useForm, useSelector } from '@tanstack/react-form';
import { CalendarCheck, SendHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import type { Appointment, ChatMessage, SlotOption } from '~/lib/api';
import { formatSlot } from '~/lib/format';
import { useSendChat } from '~/lib/queries';

// Same rules as the booking form's patient fields.
const patientSchema = z.object({
	patientName: z.string().trim().min(1, 'Enter the patient name').max(100, 'Keep it under 100 characters'),
	patientEmail: z.email('Enter a valid email'),
});

const HISTORY_LIMIT = 20;

type UiMessage = ChatMessage & {
	id: number;
	slots?: SlotOption[];
	appointment?: Appointment | null;
	/** Failed requests show up inline but are not sent back as history. */
	isError?: boolean;
};

/** "Tue 3 Nov" for a clinic-local calendar date. */
function formatDate(date: string) {
	return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(
		new Date(`${date}T12:00:00Z`),
	);
}

export function AssistantPanel({ tz }: { tz: string }) {
	const sendChat = useSendChat();
	const [messages, setMessages] = useState<UiMessage[]>([]);
	const [draft, setDraft] = useState('');
	const nextId = useRef(0);
	const scrollRef = useRef<HTMLDivElement>(null);

	const form = useForm({
		defaultValues: { patientName: '', patientEmail: '' },
		validators: { onChange: patientSchema },
	});
	const patientValues = useSelector(form.store, s => s.values);
	const patient = patientSchema.safeParse(patientValues);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever a message or the typing indicator appears
	useEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messages, sendChat.isPending]);

	function append(message: Omit<UiMessage, 'id'>) {
		const withId = { ...message, id: nextId.current++ };
		setMessages(prev => [...prev, withId]);
		return withId;
	}

	async function send(content: string, selection?: SlotOption) {
		const userMessage = append({ role: 'user', content });
		const history = [...messages, userMessage]
			.filter(m => !m.isError)
			.slice(-HISTORY_LIMIT)
			.map(({ role, content }) => ({ role, content }));
		try {
			const res = await sendChat.mutateAsync({
				messages: history,
				patient: patient.success ? { name: patient.data.patientName, email: patient.data.patientEmail } : undefined,
				selection: selection && {
					doctorId: selection.doctorId,
					date: selection.date,
					startTime: selection.startTime,
					durationMinutes: selection.durationMinutes,
				},
			});
			append({ role: 'assistant', content: res.message, slots: res.slots, appointment: res.appointment });
			if (res.appointment) {
				toast.success(`Booked with ${res.appointment.doctorName} — ${formatSlot(res.appointment.startsAt, tz)}`);
			}
		} catch (err) {
			append({
				role: 'assistant',
				content: err instanceof Error ? err.message : 'Something went wrong',
				isError: true,
			});
		}
	}

	function submitDraft() {
		const content = draft.trim();
		if (!content || sendChat.isPending) return;
		setDraft('');
		void send(content);
	}

	function pickSlot(slot: SlotOption) {
		if (!patient.success || sendChat.isPending) return;
		void send(
			`Book ${slot.doctorName} on ${formatDate(slot.date)} at ${slot.startTime} (${slot.durationMinutes} min)`,
			slot,
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="grid gap-4 sm:grid-cols-2">
				<form.Field name="patientName">
					{field => {
						const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
						return (
							<Field data-invalid={isInvalid}>
								<FieldLabel htmlFor="assistant-patientName">Patient name</FieldLabel>
								<Input
									id="assistant-patientName"
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
								<FieldLabel htmlFor="assistant-patientEmail">Email</FieldLabel>
								<Input
									id="assistant-patientEmail"
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

			<div
				ref={scrollRef}
				role="log"
				aria-label="Conversation"
				className="flex h-96 flex-col gap-3 overflow-y-auto rounded-lg border bg-muted/30 p-3"
			>
				{messages.length === 0 && (
					<p className="m-auto max-w-xs text-center text-muted-foreground text-sm">
						Try “I need a dermatologist next Tuesday afternoon, 30 minutes”.
					</p>
				)}
				{messages.map(m => (
					<div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex flex-col items-start gap-2'}>
						<p
							className={
								m.role === 'user'
									? 'max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-primary-foreground text-sm'
									: m.isError
										? 'max-w-[85%] rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm'
										: 'max-w-[85%] whitespace-pre-wrap rounded-lg bg-background px-3 py-2 text-sm shadow-xs'
							}
						>
							{m.content}
						</p>
						{m.appointment && (
							<Badge variant="secondary" className="gap-1">
								<CalendarCheck />
								Booked · {m.appointment.doctorName} · {formatSlot(m.appointment.startsAt, tz)}
							</Badge>
						)}
						{m.slots && m.slots.length > 0 && (
							<div className="flex w-full flex-col gap-1.5">
								<ul aria-label="Available slots" className="grid w-full gap-2 sm:grid-cols-2">
									{m.slots.map(slot => (
										<li key={`${slot.doctorId}-${slot.date}-${slot.startTime}-${slot.durationMinutes}`}>
											<button
												type="button"
												disabled={!patient.success || sendChat.isPending}
												onClick={() => pickSlot(slot)}
												className="flex w-full flex-col items-start rounded-lg border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-primary hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-50"
											>
												<span className="font-medium">
													{formatDate(slot.date)}, {slot.startTime}
												</span>
												<span className="text-muted-foreground text-xs">
													{slot.doctorName} · {slot.specialty} · {slot.durationMinutes} min
												</span>
											</button>
										</li>
									))}
								</ul>
								{!patient.success && (
									<p className="text-muted-foreground text-xs">Enter the patient name and email to book a slot.</p>
								)}
							</div>
						)}
					</div>
				))}
				{sendChat.isPending && (
					<div
						role="status"
						aria-label="Assistant is typing"
						className="flex gap-1 rounded-lg bg-background px-3 py-3 shadow-xs self-start"
					>
						{[0, 150, 300].map(delay => (
							<span
								key={delay}
								className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
								style={{ animationDelay: `${delay}ms` }}
							/>
						))}
					</div>
				)}
			</div>

			<form
				className="flex flex-col gap-2"
				onSubmit={e => {
					e.preventDefault();
					submitDraft();
				}}
			>
				<Textarea
					aria-label="Message"
					placeholder="Ask for a doctor, a day and a duration…"
					rows={2}
					maxLength={2000}
					value={draft}
					onChange={e => setDraft(e.target.value)}
					onKeyDown={e => {
						if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
							e.preventDefault();
							submitDraft();
						}
					}}
				/>
				<div className="flex justify-between gap-2">
					<Button
						type="button"
						variant="ghost"
						disabled={messages.length === 0 || sendChat.isPending}
						onClick={() => setMessages([])}
					>
						Clear conversation
					</Button>
					<Button type="submit" disabled={!draft.trim() || sendChat.isPending}>
						Send
						<SendHorizontal />
					</Button>
				</div>
			</form>
		</div>
	);
}
