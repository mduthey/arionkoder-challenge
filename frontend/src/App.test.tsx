import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '~/App';
import { fetchRoutes, json, renderWithClient } from '~/test/render';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('App', () => {
	it('renders the booking form and the appointment list once config and doctors load', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				fetchRoutes(url => {
					if (url.pathname === '/api/config') return json(200, { clinicTimezone: 'UTC' });
					if (url.pathname === '/api/doctors') return json(200, []);
					if (url.pathname === '/api/appointments') return json(200, []);
				}),
			),
		);
		renderWithClient(<App />);

		expect(screen.getByRole('heading', { name: 'Clinic Booking' })).toBeInTheDocument();
		expect(await screen.findByText('Book an appointment')).toBeInTheDocument();
		expect(await screen.findByText('No upcoming appointments.')).toBeInTheDocument();
	});
});
