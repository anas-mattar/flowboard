import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { BoardHydrated, BoardList, BoardPatch, BoardSummary } from '@flowboard/shared';
import { getBoard, patchBoard } from '../api/boards';
import { boardsQueryKey } from './useBoards';

export function boardQueryKey(boardId: string) {
  return ['board', boardId] as const;
}

export function boardQueryOptions(boardId: string) {
  return {
    queryKey: boardQueryKey(boardId),
    queryFn: () => getBoard(boardId),
    // Without this, every component reading the same cache entry
    // (`AuthenticatedLayout`, `BoardTitleBar`, `BoardCanvas`) would trigger
    // its own refetch-on-mount on top of the `beforeLoad` fetch that just
    // populated it (`staleTime` default is 0) — same reasoning as
    // `meQueryOptions` (FB-02).
    staleTime: 10_000,
  } as const;
}

/** `boardId` is `undefined` on routes other than `/boards/$boardId` (the layout reads it unconditionally). */
export function useBoard(boardId: string | undefined): UseQueryResult<BoardHydrated> {
  return useQuery({
    ...boardQueryOptions(boardId ?? ''),
    enabled: boardId !== undefined,
  });
}

export interface UpdateBoardVariables {
  patch: BoardPatch;
  /** Omitted for a starred-only patch (CL-E14, CL-E18). */
  ifMatch?: string;
}

interface MutationContext {
  previousBoard: BoardHydrated | undefined;
  previousList: BoardList | undefined;
}

/**
 * Shared rename/star/archive mutation (FS §4.2, §4.3, B-06): optimistically
 * patches both the hydrated board cache and the sidebar row, rolls back on
 * error, and merges the server's authoritative `BoardSummary` into both
 * caches on success — no extra round trip needed since the response already
 * carries everything the caches hold. A `409` is not retried here: the
 * caller (`BoardTitle`) explicitly re-fetches instead of trusting a rollback
 * (FS §7.1, CL-E18). Callers pass per-call `onSuccess`/`onError` to
 * `mutate()` for their own toast and navigation behaviour.
 */
export function useUpdateBoard(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation<BoardSummary, Error, UpdateBoardVariables, MutationContext>({
    mutationFn: ({ patch, ifMatch }) => patchBoard(boardId, patch, ifMatch),
    onMutate: async ({ patch }) => {
      await queryClient.cancelQueries({ queryKey: boardQueryKey(boardId) });
      await queryClient.cancelQueries({ queryKey: boardsQueryKey });

      const previousBoard = queryClient.getQueryData<BoardHydrated>(boardQueryKey(boardId));
      const previousList = queryClient.getQueryData<BoardList>(boardsQueryKey);

      if (previousBoard) {
        queryClient.setQueryData<BoardHydrated>(boardQueryKey(boardId), {
          ...previousBoard,
          board: {
            ...previousBoard.board,
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.color !== undefined ? { color: patch.color } : {}),
            ...(patch.archived !== undefined
              ? { archivedAt: patch.archived ? new Date().toISOString() : null }
              : {}),
          },
          starred: patch.starred ?? previousBoard.starred,
        });
      }

      if (previousList) {
        queryClient.setQueryData<BoardList>(boardsQueryKey, {
          ...previousList,
          items:
            patch.archived === true
              ? previousList.items.filter((item) => item.id !== boardId)
              : previousList.items.map((item) =>
                  item.id === boardId
                    ? {
                        ...item,
                        ...(patch.name !== undefined ? { name: patch.name } : {}),
                        ...(patch.color !== undefined ? { color: patch.color } : {}),
                        ...(patch.starred !== undefined ? { starred: patch.starred } : {}),
                      }
                    : item,
                ),
        });
      }

      return { previousBoard, previousList };
    },
    onSuccess: (data) => {
      queryClient.setQueryData<BoardHydrated>(boardQueryKey(boardId), (current) =>
        current
          ? {
              ...current,
              board: {
                ...current.board,
                name: data.name,
                color: data.color,
                archivedAt: data.archivedAt,
                updatedAt: data.updatedAt,
              },
              starred: data.starred,
            }
          : current,
      );
      queryClient.setQueryData<BoardList>(boardsQueryKey, (current) => {
        if (!current) {
          return current;
        }
        if (data.archivedAt !== null) {
          return { ...current, items: current.items.filter((item) => item.id !== boardId) };
        }
        return {
          ...current,
          items: current.items.map((item) =>
            item.id === boardId
              ? {
                  ...item,
                  name: data.name,
                  color: data.color,
                  starred: data.starred,
                  cardCount: data.cardCount,
                }
              : item,
          ),
        };
      });
    },
    onError: (_error, _variables, context) => {
      if (context?.previousBoard) {
        queryClient.setQueryData(boardQueryKey(boardId), context.previousBoard);
      }
      if (context?.previousList) {
        queryClient.setQueryData(boardsQueryKey, context.previousList);
      }
    },
  });
}
