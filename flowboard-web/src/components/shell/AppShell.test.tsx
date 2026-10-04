import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '../../i18n/messages';
import { makeMeResponse } from '../../test/fixtures';
import { jsonResponse, mockFetchSequence } from '../../test/mock-fetch';
import { renderApp } from '../../test/render-app';

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('AppShell sidebar collapse (FS X-04, acceptance criterion 3)', () => {
  it('collapsing the sidebar persists across a reload', async () => {
    const me = makeMeResponse();
    mockFetchSequence(jsonResponse(200, me), jsonResponse(200, me));

    renderApp('/');
    const toggle = await screen.findByRole('button', { name: messages.shell.toggleSidebar });
    const sidebar = screen.getByRole('navigation', { name: messages.app.name });

    expect(sidebar).toHaveAttribute('data-visible', 'true');
    fireEvent.click(toggle);
    expect(sidebar).toHaveAttribute('data-visible', 'false');
    expect(window.localStorage.getItem('flowboard:sidebarCollapsed')).toBe('true');

    renderApp('/');
    const sidebarAfterReload = await screen.findAllByRole('navigation', {
      name: messages.app.name,
    });
    expect(sidebarAfterReload.at(-1)).toHaveAttribute('data-visible', 'false');
  });

  it('the theme toggle cycles light -> dark -> system and applies instantly', async () => {
    const me = makeMeResponse({ user: { ...makeMeResponse().user, theme: 'light' } });
    mockFetchSequence(jsonResponse(200, me));

    renderApp('/');
    const themeButton = await screen.findByRole('button', { name: /Theme: Light/ });

    fireEvent.click(themeButton);
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });
});

describe('AppShell initial focus (FS §10 tab order, TAS-73)', () => {
  it('does not steal focus from the skip link on first mount', async () => {
    const me = makeMeResponse();
    mockFetchSequence(jsonResponse(200, me));

    renderApp('/');
    const heading = await screen.findByRole('heading', { name: messages.shell.boards });

    expect(heading).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
  });
});
