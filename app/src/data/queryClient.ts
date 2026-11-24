// The app's TanStack Query client, in its own module so auth and account flows can clear it.
// Query keys aren't user-scoped, so the cache must be cleared whenever the user changes.
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 }, mutations: { retry: 0 } },
});
