import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '../i18n/messages';
import { makeBoardSummary, makeMeResponse } from '../test/fixtures';
import { emptyResponse, jsonResponse, mockFetchSequence } from '../test/mock-fetch';
import { renderApp } from '../test/render-app';

function boardsPage(items: ReturnType<typeof makeBoardSummary>[]) {
  return jsonResponse(200, { items, nextCursor: null });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('index route (FB-04 spec §4 item 15)', () => {
  it('shows the empty workspace state with the create form focused when there are no boards', async () => {
    const me = makeMeResponse();
    mockFetchSequence(jsonResponse(200, me), boardsPage([]));

    renderApp('/');

    expect(await screen.findByText(me.user.displayName)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: messages.boards.empty.title })).toBeInTheDocument();
    const input = screen.getByPlaceholderText(messages.boards.create.placeholder);
    await waitFor(() => {
      expect(input).toHaveFocus();
    });
  });

  it('redirects to the first board in sidebar order when the workspace has boards', async () => {
    const me = makeMeResponse();
    const first = makeBoardSummary({ name: 'Alpha' });
    const second = makeBoardSummary({ name: 'Beta' });
    mockFetchSequence(
      jsonResponse(200, me),
      boardsPage([first, second]),
      jsonResponse(200, {
        board: {
          id: first.id,
          workspaceId: first.workspaceId,
          name: first.name,
          color: first.color,
          archivedAt: null,
          createdAt: first.createdAt,
          updatedAt: first.updatedAt,
        },
        members: [],
        labels: [],
        lists: [],
        starred: false,
        callerRole: 'admin',
      }),
    );

    const { router } = renderApp('/');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/boards/${first.id}`);
    });
  });

  it('redirects a signed-out visitor to /login?next=/ (FB-03 spec acceptance criterion 5)', async () => {
    mockFetchSequence(
      jsonResponse(401, { error: { code: 'unauthenticated', message: 'Authentication required' } }),
    );

    const { router } = renderApp('/');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: messages.auth.login.title })).toBeInTheDocument();
    });
    expect(router.state.location.search).toEqual({ next: '/' });
  });

  it('signing out from the footer menu clears the session and navigates to /login', async () => {
    const me = makeMeResponse();
    mockFetchSequence(jsonResponse(200, me), boardsPage([]), emptyResponse(204));

    renderApp('/');

    await screen.findByText(me.user.displayName);
    fireEvent.click(screen.getByRole('button', { name: messages.shell.userMenu }));
    fireEvent.click(await screen.findByRole('menuitem', { name: messages.auth.signOut }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: messages.auth.login.title })).toBeInTheDocument();
    });
  });
});
