import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { MeResponse } from '@flowboard/shared';
import { getMe } from '../api/auth';

export const meQueryKey = ['me'] as const;

/**
 * Shared `GET /v1/me` query options. Used both by `useSession()` and by the
 * route guards in `beforeLoad`, so a route guard and a rendered component
 * always see the same cache entry (FB-02 spec §4 item 13).
 */
export function meQueryOptions() {
  return {
    queryKey: meQueryKey,
    queryFn: getMe,
    retry: false,
    staleTime: 60_000,
    // The route guards already resolve this query in `beforeLoad` before any
    // component using `useSession()` mounts; without these, mounting a
    // second observer (the root route's theme effect, the page itself)
    // would re-run `GET /v1/me` again on every navigation — `retryOnMount`
    // matters specifically when the cached result is a 401 (no data), which
    // `refetchOnMount` alone does not suppress.
    retryOnMount: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  } as const;
}

export function useSession(): UseQueryResult<MeResponse> {
  return useQuery(meQueryOptions());
}
