import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantPanel } from '~/features/assistant/AssistantPanel';
import type { Appointment, ChatResponse, SlotOption } from '~/lib/api';
import { fetchRoutes, json, renderWithClient } from '~/test/render';

const TZ = 'UTC';

const slots: SlotOption[] = [
	{
		doctorId: 2,
		doctorName: 'Dr. Sofía Ruiz',
		specialty: 'Dermatology',
		date: '2099-01-06',
		startTime: '14:00',
		durationMinutes: 30,
	},
	{
		doctorId: 2,
		doctorName: 'Dr. Sofía Ruiz',
		specialty: 'Dermatology',
		date: '2099-01-06',
		startTime: '15:30',
		durationMinutes: 30,
	},
];

const appointment: Appointment = {
	id: 7,
	doctorId: 2,
	doctorName: 'Dr. Sofía Ruiz',
	specialty: 'Dermatology',
	patientName: 'Ana Gómez',
	patientEmail: 'ana@example.com',
	startsAt: '2099-01-06T14:00:00.000Z',
	endsAt: '2099-01-06T14:30:00.000Z',
	reason: null,
	status: 'scheduled',
};

let replies: ChatResponse[];
let fetchMock: ReturnType<typeof vi.fn>;

const chatBodies = () =>
	fetchMock.mock.calls
		.filter(([url]) => String(url).endsWith('/api/assistant/chat'))
		.map(([, init]) => JSON.parse(String((init as RequestInit).body)));

beforeEach(() => {
	replies = [];
	fetchMock = vi.fn(
		fetchRoutes(url => {
			if (url.pathname === '/api/assistant/chat') return json(200, replies.shift());
		}),
	);
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

async function askForSlots(user: ReturnType<typeof userEvent.setup>) {
	replies.push({ message: 'Here are two options.', slots, appointment: null });
	await user.type(screen.getByLabelText('Message'), 'Dermatologist on Tuesday afternoon{Enter}');
	return within(await screen.findByRole('list', { name: 'Available slots' }));
}

describe('AssistantPanel', () => {
	it('renders the offered slots as cards', async () => {
		const user = userEvent.setup();
		renderWithClient(<AssistantPanel tz={TZ} />);

		const cards = await askForSlots(user);

		expect(screen.getByText('Here are two options.')).toBeInTheDocument();
		expect(cards.getAllByRole('button')).toHaveLength(2);
		// No patient details yet: cards can't be booked.
		expect(cards.getAllByRole('button')[0]).toBeDisabled();
		expect(chatBodies()[0]).toEqual({
			messages: [{ role: 'user', content: 'Dermatologist on Tuesday afternoon' }],
		});
	});

	it('books a clicked card with the selection and the patient', async () => {
		const user = userEvent.setup();
		renderWithClient(<AssistantPanel tz={TZ} />);
		await user.type(screen.getByLabelText('Patient name'), 'Ana Gómez');
		await user.type(screen.getByLabelText('Email'), 'ana@example.com');
		const cards = await askForSlots(user);

		replies.push({ message: 'Booked!', slots: [], appointment });
		await user.click(cards.getByRole('button', { name: /14:00/ }));

		expect(await screen.findByText('Booked!')).toBeInTheDocument();
		const body = chatBodies()[1];
		expect(body.selection).toEqual({ doctorId: 2, date: '2099-01-06', startTime: '14:00', durationMinutes: 30 });
		expect(body.patient).toEqual({ name: 'Ana Gómez', email: 'ana@example.com' });
		expect(body.messages.at(-1)).toEqual({
			role: 'user',
			content: 'Book Dr. Sofía Ruiz on Tue 6 Jan at 14:00 (30 min)',
		});
		expect(screen.getByText(/Booked · Dr\. Sofía Ruiz/)).toBeInTheDocument();
	});

	it('shows request errors inline', async () => {
		const user = userEvent.setup();
		fetchMock.mockImplementation(async () =>
			json(502, { error: 'assistant_unavailable', message: 'Try again later.' }),
		);
		renderWithClient(<AssistantPanel tz={TZ} />);

		await user.type(screen.getByLabelText('Message'), 'Hello{Enter}');

		expect(await screen.findByText('Try again later.')).toBeInTheDocument();
	});
});
