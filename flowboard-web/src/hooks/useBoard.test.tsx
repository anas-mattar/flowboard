import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeBoardHydrated, makeBoardSummary } from '../test/fixtures';
import { jsonResponse, mockFetchSequence } from '../test/mock-fetch';
import { boardQueryKey, useUpdateBoard } from './useBoard';
import { boardsQueryKey } from './useBoards';

afterEach(() => {
  vi.unstubAllGlobals();
});

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useUpdateBoard (FB-04 §6, FS §7.1 optimistic concurrency)', () => {
  it('optimistically patches the board and sidebar caches, then merges the server response', async () => {
    const summary = makeBoardSummary({ name: 'Before' });
    const hydrated = makeBoardHydrated({
      board: { ...makeBoardHydrated().board, id: summary.id, name: 'Before' },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(boardQueryKey(summary.id), hydrated);
    queryClient.setQueryData(boardsQueryKey, { items: [summary], nextCursor: null });

    mockFetchSequence(jsonResponse(200, { ...summary, name: 'After' }));

    const { result } = renderHook(() => useUpdateBoard(summary.id), {
      wrapper: wrapper(queryClient),
    });

    result.current.mutate({ patch: { name: 'After' }, ifMatch: hydrated.board.updatedAt });

    // `onMutate` itself awaits `cancelQueries` first, so the optimistic
    // write lands a tick after `mutate()` returns, not synchronously.
    await waitFor(() => {
      expect(queryClient.getQueryData<typeof hydrated>(boardQueryKey(summary.id))?.board.name).toBe(
        'After',
      );
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(
      queryClient.getQueryData<{ items: { name: string }[] }>(boardsQueryKey)?.items[0]?.name,
    ).toBe('After');
  });

  it('rolls back both caches when the request fails', async () => {
    const summary = makeBoardSummary({ name: 'Before' });
    const hydrated = makeBoardHydrated({
      board: { ...makeBoardHydrated().board, id: summary.id, name: 'Before' },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(boardQueryKey(summary.id), hydrated);
    queryClient.setQueryData(boardsQueryKey, { items: [summary], nextCursor: null });

    mockFetchSequence(jsonResponse(500, { error: { code: 'internal_error', message: 'Boom' } }));

    const { result } = renderHook(() => useUpdateBoard(summary.id), {
      wrapper: wrapper(queryClient),
    });

    result.current.mutate({ patch: { name: 'After' }, ifMatch: hydrated.board.updatedAt });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(queryClient.getQueryData<typeof hydrated>(boardQueryKey(summary.id))?.board.name).toBe(
      'Before',
    );
    expect(
      queryClient.getQueryData<{ items: { name: string }[] }>(boardsQueryKey)?.items[0]?.name,
    ).toBe('Before');
  });
});
