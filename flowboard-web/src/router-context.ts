import type { QueryClient } from '@tanstack/react-query';

/**
 * Router context (TanStack Router), separated from `router.ts` so route
 * modules can import the type without a circular dependency on the router
 * instance itself.
 */
export interface RouterContext {
  queryClient: QueryClient;
}
