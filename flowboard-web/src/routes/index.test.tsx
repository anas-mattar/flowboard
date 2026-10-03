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
  it('shows the placeholder "Signed in as <name>" for a signed-in visitor', async () => {
    const me = makeMeResponse();
    mockFetchSequence(jsonResponse(200, me));

    renderApp('/');

    expect(
      await screen.findByText(messages.app.signedInAs(me.user.displayName)),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: messages.auth.signOut })).toBeInTheDocument();
  });

  it('redirects a signed-out visitor to /login (FB-02 spec §4 item 13)', async () => {
    mockFetchSequence(
      jsonResponse(401, { error: { code: 'unauthenticated', message: 'Authentication required' } }),
    );

    renderApp('/');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: messages.auth.login.title })).toBeInTheDocument();
    });
  });

  it('calling sign out clears the session and navigates to /login', async () => {
    const me = makeMeResponse();
    mockFetchSequence(jsonResponse(200, me), emptyResponse(204));

    renderApp('/');

    const signOutButton = await screen.findByRole('button', { name: messages.auth.signOut });
    fireEvent.click(signOutButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: messages.auth.login.title })).toBeInTheDocument();
    });
  });
});
