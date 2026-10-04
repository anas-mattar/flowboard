import { createRoute } from '@tanstack/react-router';
import { EmptyState } from '../components/primitives/EmptyState';
import { messages } from '../i18n/messages';
import { authenticatedLayoutRoute } from './authenticated';

/**
 * Board list placeholder (FB-03 spec §3: "FB-03 ships the route with a
 * placeholder outlet"). FB-04 replaces this with the real board list and
 * "Create board" action; the `EmptyState` primitive ships here so FB-04 can
 * reuse it unchanged (BM §5).
 */
function IndexPage() {
  return <EmptyState heading={messages.shell.noBoardsTitle} body={messages.shell.noBoardsBody} />;
}

export const indexRoute = createRoute({
  getParentRoute: () => authenticatedLayoutRoute,
  path: '/',
  component: IndexPage,
});
