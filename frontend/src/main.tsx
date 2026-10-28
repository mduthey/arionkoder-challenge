import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '~/App';
import { Toaster } from '~/components/ui/sonner';
import { ApiError } from '~/lib/api';
import '~/index.css';

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// Client errors won't fix themselves on retry.
			retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 1,
		},
	},
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<App />
			<Toaster richColors position="top-center" />
		</QueryClientProvider>
	</StrictMode>,
);
