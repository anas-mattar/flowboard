import { Outlet, createRoute, redirect, useParams } from '@tanstack/react-router';
import { BoardList } from '../components/boards/BoardList';
import { BoardTitleBar } from '../components/boards/BoardTitleBar';
import { AppShell } from '../components/shell/AppShell';
import { useBoard } from '../hooks/useBoard';
import { meQueryOptions } from '../hooks/useSession';
import { rootRoute } from './root';

/**
 * Authenticated layout route (FB-03 spec §3): guards `/` and (from FB-04)
 * `/boards/$boardId`, redirecting a signed-out visitor to
 * `/login?next=<path>` (acceptance criterion 5), and renders the app shell
 * around the matched child route.
 */
export const authenticatedLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated-layout',
  beforeLoad: async ({ context, location }) => {
    try {
      await context.queryClient.ensureQueryData(meQueryOptions());
    } catch {
      redirect({ to: '/login', search: { next: location.href }, throw: true });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  // `boardId` only matches on `/boards/$boardId`; `AppShell` is mounted once
  // here for the whole authenticated area (FB-03 spec §3), so the board
  // title/star/menu slot is read from the active route's params rather than
  // rendered by each leaf route (that would remount `AppShell` on every
  // navigation and break its sidebar collapse/overlay state).
  const boardId = useParams({
    strict: false,
    select: (params: { boardId?: string }) => params.boardId,
  });
  const boardQuery = useBoard(boardId);
  const boardName = boardId ? boardQuery.data?.board.name : undefined;

  return (
    <AppShell
      // `exactOptionalPropertyTypes`: omit `title` entirely rather than pass
      // `undefined` explicitly, so the index route still gets `AppShell`'s
      // own "Boards" default.
      {...(boardName !== undefined ? { title: boardName } : {})}
      titleSlot={boardId ? <BoardTitleBar boardId={boardId} /> : undefined}
      boardsSlot={<BoardList />}
    >
      <Outlet />
    </AppShell>
  );
}
