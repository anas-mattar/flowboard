import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { routeTree } from '../routeTree';

export interface RenderAppOptions {
  /** Wraps the tree in `<StrictMode>`, matching `main.tsx`'s dev-build effect double-invocation. */
  strict?: boolean;
}

/**
 * Renders the whole route tree at a given path with a fresh `QueryClient`
 * shared by the router context (`beforeLoad`) and `QueryClientProvider`
 * (hooks), matching how `main.tsx` wires the two together.
 */
export function renderApp(initialPath: string, options: RenderAppOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const history = createMemoryHistory({ initialEntries: [initialPath] });
  const router = createRouter({ routeTree, context: { queryClient }, history });

  const tree = (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );

  const utils = render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);

  return { ...utils, queryClient, router };
}
