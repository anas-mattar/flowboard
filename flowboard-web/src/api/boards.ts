import type {
  BoardCreate,
  BoardHydrated,
  BoardList,
  BoardPatch,
  BoardSummary,
} from '@flowboard/shared';
import { request } from './client';

export function listBoards(): Promise<BoardList> {
  return request<BoardList>('/v1/boards', { method: 'GET' });
}

export function createBoard(body: BoardCreate): Promise<BoardHydrated> {
  return request<BoardHydrated>('/v1/boards', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getBoard(boardId: string): Promise<BoardHydrated> {
  return request<BoardHydrated>(`/v1/boards/${boardId}`, { method: 'GET' });
}

/**
 * `If-Match` is sent whenever `ifMatch` is given; the web app always passes
 * it except when `starred` is the only field changing (CL-E14, CL-E18: a
 * star toggle does not bump `updatedAt`, so there is nothing to match).
 */
export function patchBoard(
  boardId: string,
  body: BoardPatch,
  ifMatch?: string,
): Promise<BoardSummary> {
  const headers: Record<string, string> = {};
  if (ifMatch !== undefined) {
    headers['If-Match'] = ifMatch;
  }
  return request<BoardSummary>(`/v1/boards/${boardId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}
