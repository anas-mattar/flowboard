import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { BoardCreate, BoardHydrated, BoardList } from '@flowboard/shared';
import { createBoard, listBoards } from '../api/boards';
import { boardQueryKey } from './useBoard';

export const boardsQueryKey = ['boards'] as const;

/**
 * Shared `GET /v1/boards` query options (FB-04 §6): one page is enough for
 * MVP workspaces (spec §3), so the sidebar never paginates. Used both by
 * `useBoards()` and by the `/` route's `beforeLoad` redirect, same pattern as
 * `meQueryOptions` (FB-02).
 */
export function boardsQueryOptions() {
  return {
    queryKey: boardsQueryKey,
    queryFn: listBoards,
    staleTime: 10_000,
  } as const;
}

export function useBoards(): UseQueryResult<BoardList> {
  return useQuery(boardsQueryOptions());
}

/**
 * Create-board mutation (FS §4.1, AC 10): seeds the new board's hydrated
 * cache entry so the board route renders instantly without a second fetch,
 * and invalidates the sidebar list so it picks up the new row.
 */
export function useCreateBoard() {
  const queryClient = useQueryClient();

  return useMutation<BoardHydrated, Error, BoardCreate>({
    mutationFn: (body) => createBoard(body),
    onSuccess: (hydrated) => {
      queryClient.setQueryData(boardQueryKey(hydrated.board.id), hydrated);
      // Fire-and-forget (TAS-107): `useMutation`'s `onSuccess` is awaited
      // before the per-call `onSuccess` passed to `.mutate()` runs, so
      // returning this promise made the caller's toast and `navigate` wait
      // on a second `GET /v1/boards` round trip for the sidebar refresh
      // before either could fire. Correct regardless of X-01: the caller
      // shouldn't block on a background cache refresh it doesn't render
      // synchronously. Same pattern as `BoardTitle.tsx`'s rename
      // invalidation. NOTE: an A/B run (TAS-107) showed this does not
      // change the X-01 create-toast pass rate under `--workers=3` load
      // (30/36 both with and without) — the flakiness there is dominated
      // by test-worker CPU contention, not this code path.
      void queryClient.invalidateQueries({ queryKey: boardsQueryKey });
    },
  });
}
