import { Outlet, createRoute, redirect } from '@tanstack/react-router';
import { AppShell } from '../components/shell/AppShell';
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
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
