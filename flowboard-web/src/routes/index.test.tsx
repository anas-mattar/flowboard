import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '../i18n/messages';
import { makeMeResponse } from '../test/fixtures';
import { emptyResponse, jsonResponse, mockFetchSequence } from '../test/mock-fetch';
import { renderApp } from '../test/render-app';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('index route', () => {
  it('shows the app shell with the signed-in user and the "no boards" placeholder', async () => {
    const me = makeMeResponse();
    mockFetchSequence(jsonResponse(200, me));

    renderApp('/');

    expect(await screen.findByText(me.user.displayName)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: messages.shell.noBoardsTitle })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: messages.app.name })).toBeInTheDocument();
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
    mockFetchSequence(jsonResponse(200, me), emptyResponse(204));

    renderApp('/');

    await screen.findByText(me.user.displayName);
    fireEvent.click(screen.getByRole('button', { name: messages.shell.userMenu }));
    fireEvent.click(await screen.findByRole('menuitem', { name: messages.auth.signOut }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: messages.auth.login.title })).toBeInTheDocument();
    });
  });
});
