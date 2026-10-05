import { createRoute, redirect } from '@tanstack/react-router';
import { CreateBoard } from '../components/boards/CreateBoard';
import { EmptyState } from '../components/primitives/EmptyState';
import { boardsQueryOptions } from '../hooks/useBoards';
import { messages } from '../i18n/messages';
import { authenticatedLayoutRoute } from './authenticated';

/**
 * `/` (FB-04 spec §4 item 15): redirects to the first board in sidebar
 * order (starred first, then alphabetical — the order `GET /v1/boards`
 * already returns, FB-04 §6) when the workspace has one, otherwise renders
 * the empty-workspace state with the create form focused.
 */
export const indexRoute = createRoute({
  getParentRoute: () => authenticatedLayoutRoute,
  path: '/',
  beforeLoad: async ({ context }) => {
    const boards = await context.queryClient.ensureQueryData(boardsQueryOptions());
    const firstBoard = boards.items[0];
    if (firstBoard) {
      redirect({ to: '/boards/$boardId', params: { boardId: firstBoard.id }, throw: true });
    }
  },
  component: IndexPage,
});

function IndexPage() {
  return (
    <EmptyState
      heading={messages.boards.empty.title}
      body={messages.boards.empty.body}
      action={<CreateBoard autoStart />}
    />
  );
}
