'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, type ReactNode } from 'react';

interface QueryProviderProps {
  children: ReactNode;
}

export default function QueryProvider({ children }: QueryProviderProps) {
  // Create QueryClient once per client session; avoids shared state across requests
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Keep cached data fresh for 55 seconds (poll interval is 60s)
            staleTime: 55_000,
            // Retry failed requests up to 2 times before showing error
            retry: 2,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
            // Don't refetch on window focus — trading dashboards don't need it
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
