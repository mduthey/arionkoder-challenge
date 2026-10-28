import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingForm } from '~/features/booking/BookingForm';
import type { Doctor, Slot } from '~/lib/api';
import { fetchRoutes, json, renderWithClient } from '~/test/render';

const TZ = 'America/Argentina/Buenos_Aires';
const doctors: Doctor[] = [
	{ id: 1, name: 'Dr. Laura Méndez', specialty: 'General Practice', workStart: '09:00', workEnd: '17:00' },
];
const slot = (startTime: string, startsAt: string): Slot => ({
	doctorId: 1,
	date: '2099-01-05',
	startTime,
	durationMinutes: 30,
	startsAt,
});

const conflict = () =>
	json(409, {
		error: 'doctor_conflict',
		message: 'Dr. Laura Méndez is already booked at that time.',
		suggestions: [slot('10:30', '2099-01-05T13:30:00.000Z'), slot('11:00', '2099-01-05T14:00:00.000Z')],
	});

let fetchMock: ReturnType<typeof vi.fn>;
let postResponse: () => Response;

beforeEach(() => {
	postResponse = conflict;
	fetchMock = vi.fn(
		fetchRoutes(
			url =>
				url.pathname.endsWith('/availability') ? json(200, { date: '', durationMinutes: 30, slots: [] }) : undefined,
			(url, init) => (url.pathname === '/api/appointments' && init?.method === 'POST' ? postResponse() : undefined),
		),
	);
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');

describe('BookingForm', () => {
	it('shows validation messages and sends nothing when submitted empty', async () => {
		const user = userEvent.setup();
		renderWithClient(<BookingForm doctors={doctors} tz={TZ} />);

		await user.click(screen.getByRole('button', { name: 'Book appointment' }));

		expect(await screen.findByText('Choose a start time')).toBeInTheDocument();
		expect(screen.getByText('Enter the patient name')).toBeInTheDocument();
		expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
		expect(posts()).toHaveLength(0);
	});

	it('renders the conflict and fills the time from a suggestion', async () => {
		const user = userEvent.setup();
		renderWithClient(<BookingForm doctors={doctors} tz={TZ} />);

		fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2099-01-05' } });
		fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '10:00' } });
		await user.type(screen.getByLabelText('Patient name'), 'Ana Gómez');
		await user.type(screen.getByLabelText('Email'), 'ana@example.com');
		await user.click(screen.getByRole('button', { name: 'Book appointment' }));

		expect(await screen.findByText('Dr. Laura Méndez is already booked at that time.')).toBeInTheDocument();
		expect(posts()).toHaveLength(1);
		const suggestions = within(screen.getByRole('list', { name: 'Suggested slots' }));
		expect(suggestions.getAllByRole('button')).toHaveLength(2);

		await user.click(suggestions.getByRole('button', { name: /11:00/ }));

		expect(screen.getByLabelText('Start time')).toHaveValue('11:00');
		expect(screen.getByRole('button', { name: 'Book appointment' })).toHaveFocus();
		expect(screen.queryByRole('list', { name: 'Suggested slots' })).not.toBeInTheDocument();
	});

	it('keeps the patient after a successful booking and clears the time and reason', async () => {
		postResponse = () =>
			json(201, {
				id: 7,
				doctorId: 1,
				doctorName: 'Dr. Laura Méndez',
				specialty: 'General Practice',
				patientName: 'Ana Gómez',
				patientEmail: 'ana@example.com',
				startsAt: '2099-01-05T13:00:00.000Z',
				endsAt: '2099-01-05T13:30:00.000Z',
				reason: 'Check-up',
				status: 'scheduled',
			});
		const user = userEvent.setup();
		renderWithClient(<BookingForm doctors={doctors} tz={TZ} />);

		fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2099-01-05' } });
		fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '10:00' } });
		await user.type(screen.getByLabelText('Patient name'), 'Ana Gómez');
		await user.type(screen.getByLabelText('Email'), 'ana@example.com');
		await user.type(screen.getByLabelText('Reason (optional)'), 'Check-up');
		await user.click(screen.getByRole('button', { name: 'Book appointment' }));

		await waitFor(() => expect(screen.getByLabelText('Start time')).toHaveValue(''));
		expect(screen.getByLabelText('Reason (optional)')).toHaveValue('');
		expect(screen.getByLabelText('Patient name')).toHaveValue('Ana Gómez');
		expect(screen.getByLabelText('Email')).toHaveValue('ana@example.com');
		expect(screen.getByLabelText('Date')).toHaveValue('2099-01-05');
	});
});
