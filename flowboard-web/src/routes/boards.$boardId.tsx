import { createRoute, redirect } from '@tanstack/react-router';
import { BoardCanvas } from '../components/boards/BoardCanvas';
import { boardQueryOptions } from '../hooks/useBoard';
import { authenticatedLayoutRoute } from './authenticated';

/**
 * Board page (FS §4.4, §4.5, FB-04 spec §3). The title, star and menu render
 * in `AppShell`'s `titleSlot` from `authenticated.tsx`, not here — this
 * route owns only the canvas. `beforeLoad` hydrates the board before the
 * route renders (same `ensureQueryData` pattern as `meQueryOptions`,
 * FB-02); a board that doesn't exist or isn't visible (404) falls back to
 * `/`, which redirects to the first board or shows the empty state.
 */
export const boardRoute = createRoute({
  getParentRoute: () => authenticatedLayoutRoute,
  path: '/boards/$boardId',
  beforeLoad: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(boardQueryOptions(params.boardId));
    } catch {
      redirect({ to: '/', throw: true });
    }
  },
  component: BoardPage,
});

function BoardPage() {
  const { boardId } = boardRoute.useParams();
  return <BoardCanvas boardId={boardId} />;
}
