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

describe('signup route', () => {
  it('redirects to /login beforeLoad if unauthenticated, then renders the form', async () => {
    mockFetchSequence(unauthenticated());

    renderApp('/signup');

    expect(
      await screen.findByRole('heading', { name: messages.auth.signup.title }),
    ).toBeInTheDocument();
  });

  it('focuses the first field on route entry', async () => {
    mockFetchSequence(unauthenticated());

    renderApp('/signup');

    const displayNameInput = await screen.findByLabelText(messages.auth.signup.displayName);
    await waitFor(() => {
      expect(displayNameInput).toHaveFocus();
    });
  });

  it('shows inline validation and moves focus to the first invalid field on submit', async () => {
    mockFetchSequence(unauthenticated());

    renderApp('/signup');

    const submit = await screen.findByRole('button', { name: messages.auth.signup.submit });
    fireEvent.click(submit);

    const displayNameInput = await screen.findByLabelText(messages.auth.signup.displayName);
    await waitFor(() => {
      expect(displayNameInput).toHaveFocus();
    });
    expect(screen.getAllByText(messages.validation.required).length).toBeGreaterThan(0);
  });

  it('submits valid input, then lands on / signed in (FB-02 spec §4 item 13)', async () => {
    const auth = makeAuthResponse();
    const me = makeMeResponse({ user: auth.user });
    mockFetchSequence(unauthenticated(), jsonResponse(201, auth), jsonResponse(200, me));

    renderApp('/signup');

    fireEvent.change(await screen.findByLabelText(messages.auth.signup.displayName), {
      target: { value: 'Ada Lovelace' },
    });
    fireEvent.change(screen.getByLabelText(messages.auth.signup.email), {
      target: { value: 'ada@example.com' },
    });
    fireEvent.change(screen.getByLabelText(messages.auth.signup.password), {
      target: { value: 'a-very-long-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: messages.auth.signup.submit }));

    await waitFor(() => {
      expect(screen.getByText(me.user.displayName)).toBeInTheDocument();
    });
  });

  it('renders the server error for a taken email, above the form', async () => {
    mockFetchSequence(
      unauthenticated(),
      jsonResponse(409, { error: { code: 'email_taken', message: 'Taken' } }),
    );

    renderApp('/signup');

    fireEvent.change(await screen.findByLabelText(messages.auth.signup.displayName), {
      target: { value: 'Ada Lovelace' },
    });
    fireEvent.change(screen.getByLabelText(messages.auth.signup.email), {
      target: { value: 'ada@example.com' },
    });
    fireEvent.change(screen.getByLabelText(messages.auth.signup.password), {
      target: { value: 'a-very-long-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: messages.auth.signup.submit }));

    expect(await screen.findByRole('alert')).toHaveTextContent(messages.auth.error.emailTaken);
  });

  it('clears the server error banner on Escape', async () => {
    mockFetchSequence(
      unauthenticated(),
      jsonResponse(409, { error: { code: 'email_taken', message: 'Taken' } }),
    );

    renderApp('/signup');

    fireEvent.change(await screen.findByLabelText(messages.auth.signup.displayName), {
      target: { value: 'Ada Lovelace' },
    });
    fireEvent.change(screen.getByLabelText(messages.auth.signup.email), {
      target: { value: 'ada@example.com' },
    });
    fireEvent.change(screen.getByLabelText(messages.auth.signup.password), {
      target: { value: 'a-very-long-password' },
    });
    const submitButton = screen.getByRole('button', { name: messages.auth.signup.submit });
    fireEvent.click(submitButton);
    await screen.findByRole('alert');

    await waitFor(() => {
      expect(document.activeElement).toBe(submitButton);
    });

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
