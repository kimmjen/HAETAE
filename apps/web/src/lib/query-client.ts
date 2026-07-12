import { QueryClient } from "@tanstack/react-query";

/**
 * Single QueryClient instance for the app. Defaults tuned for a local
 * dev tool that talks to a private 127.0.0.1 server — staleness is
 * cheap to invalidate and retries on transient errors are unlikely
 * to help (the server is either up or it isn't).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
