import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { useEffect } from 'react';
import type { RouterContext } from '../router-context';
import { useSession } from '../hooks/useSession';
import { applyTheme } from '../theme';

function RootComponent() {
  const session = useSession();

  useEffect(() => {
    if (session.data) {
      applyTheme(session.data.user.theme, window);
    }
  }, [session.data]);

  return <Outlet />;
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});
