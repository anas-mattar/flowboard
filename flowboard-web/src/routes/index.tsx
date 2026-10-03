import { createRoute, redirect } from '@tanstack/react-router';
import { meQueryOptions, useSession } from '../hooks/useSession';
import { useSignOut } from '../hooks/useSignOut';
import { messages } from '../i18n/messages';
import { rootRoute } from './root';

/**
 * Temporary placeholder (FB-02 spec §3): replaced by the real app shell in
 * FB-03. It exists only to prove the signed-in state and give `Sign out`
 * somewhere to live until the sidebar footer does.
 */
function IndexPage() {
  const session = useSession();
  const signOut = useSignOut();

  if (!session.data) {
    return null;
  }

  return (
    <main className="app-shell">
      <p className="app-shell__title">{messages.app.signedInAs(session.data.user.displayName)}</p>
      <button
        type="button"
        onClick={() => {
          void signOut();
        }}
      >
        {messages.auth.signOut}
      </button>
    </main>
  );
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(meQueryOptions());
    } catch {
      redirect({ to: '/login', throw: true });
    }
  },
  component: IndexPage,
});
