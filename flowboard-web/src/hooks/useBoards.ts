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
      return queryClient.invalidateQueries({ queryKey: boardsQueryKey });
    },
  });
}
