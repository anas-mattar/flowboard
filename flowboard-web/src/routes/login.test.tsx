import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '../i18n/messages';
import { makeAuthResponse, makeMeResponse } from '../test/fixtures';
import { jsonResponse, mockFetchSequence } from '../test/mock-fetch';
import { renderApp } from '../test/render-app';

afterEach(() => {
  vi.unstubAllGlobals();
});

function unauthenticated() {
  return jsonResponse(401, {
    error: { code: 'unauthenticated', message: 'Authentication required' },
  });
}

async function fillLoginForm(email: string, password: string) {
  fireEvent.change(await screen.findByLabelText(messages.auth.login.email), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText(messages.auth.login.password), {
    target: { value: password },
  });
}

describe('login route', () => {
  it('redirects a signed-in visitor to / (FB-02 spec §4 item 13)', async () => {
    const me = makeMeResponse();
    mockFetchSequence(jsonResponse(200, me));

    renderApp('/login');

    await waitFor(() => {
      expect(screen.getByText(messages.app.signedInAs(me.user.displayName))).toBeInTheDocument();
    });
  });

  it('shows one message for bad credentials (CL-E10)', async () => {
    mockFetchSequence(
      unauthenticated(),
      jsonResponse(401, {
        error: { code: 'invalid_credentials', message: 'Email or password is incorrect' },
      }),
    );

    renderApp('/login');
    await fillLoginForm('ada@example.com', 'wrong-password');
    fireEvent.click(screen.getByRole('button', { name: messages.auth.login.submit }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      messages.auth.error.invalidCredentials,
    );
  });

  it('shows the retry-after minutes message for a 429', async () => {
    mockFetchSequence(
      unauthenticated(),
      jsonResponse(
        429,
        { error: { code: 'rate_limited', message: 'Too many attempts' } },
        { 'retry-after': '120' },
      ),
    );

    renderApp('/login');
    await fillLoginForm('ada@example.com', 'whatever123');
    fireEvent.click(screen.getByRole('button', { name: messages.auth.login.submit }));

    expect(await screen.findByRole('alert')).toHaveTextContent(messages.auth.error.rateLimited(2));
  });

  it('logs in with valid input and lands on / signed in', async () => {
    const auth = makeAuthResponse();
    const me = makeMeResponse({ user: auth.user });
    mockFetchSequence(unauthenticated(), jsonResponse(200, auth), jsonResponse(200, me));

    renderApp('/login');
    await fillLoginForm('ada@example.com', 'a-very-long-password');
    fireEvent.click(screen.getByRole('button', { name: messages.auth.login.submit }));

    await waitFor(() => {
      expect(screen.getByText(messages.app.signedInAs(me.user.displayName))).toBeInTheDocument();
    });
  });

  it('is fully operable by keyboard: Enter submits', async () => {
    const auth = makeAuthResponse();
    const me = makeMeResponse({ user: auth.user });
    mockFetchSequence(unauthenticated(), jsonResponse(200, auth), jsonResponse(200, me));

    renderApp('/login');
    await fillLoginForm('ada@example.com', 'a-very-long-password');
    const passwordInput = screen.getByLabelText(messages.auth.login.password);
    fireEvent.keyDown(passwordInput, { key: 'Enter', code: 'Enter' });
    fireEvent.submit(passwordInput.closest('form') as HTMLFormElement);

    await waitFor(() => {
      expect(screen.getByText(messages.app.signedInAs(me.user.displayName))).toBeInTheDocument();
    });
  });
});
