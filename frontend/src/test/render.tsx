import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

export function renderWithClient(ui: ReactElement) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	return { queryClient, ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>) };
}

type Route = (url: URL, init?: RequestInit) => Response | undefined;

/** A `fetch` stub that answers with the first route returning a response, or 404. */
export function fetchRoutes(...routes: Route[]) {
	return async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input), 'http://localhost');
		for (const route of routes) {
			const res = route(url, init);
			if (res) return res;
		}
		return json(404, { error: 'not_found', message: `No stub for ${url.pathname}` });
	};
}

export function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
