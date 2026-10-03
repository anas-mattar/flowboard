import { createRoute } from '@tanstack/react-router';
import { messages } from '../i18n/messages';
import { rootRoute } from './root';

function IndexPage() {
  return (
    <main className="app-shell">
      <h1 className="app-shell__title">{messages.appName}</h1>
    </main>
  );
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexPage,
});
