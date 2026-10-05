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

describe('AppShell shell DOM order (FB-03 spec AC 6, TAS-86)', () => {
  it('renders header.topbar, then nav#app-sidebar, then main#main-content', async () => {
    const me = makeMeResponse();
    mockFetchSequence(jsonResponse(200, me));

    renderApp('/');
    await screen.findByRole('navigation', { name: messages.app.name });

    const topbar = document.querySelector('header.topbar');
    const sidebar = document.querySelector('nav#app-sidebar');
    const main = document.querySelector('main#main-content');
    expect(topbar).not.toBeNull();
    expect(sidebar).not.toBeNull();
    expect(main).not.toBeNull();

    expect(
      topbar!.compareDocumentPosition(sidebar!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(sidebar!.compareDocumentPosition(main!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

function stubNarrowViewport(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

describe('AppShell narrow-viewport overlay (FB-03 spec §5 TAS-86 clarification)', () => {
  it('exposes exactly one "Toggle sidebar" control and keeps the scrim out of the tab sequence', async () => {
    stubNarrowViewport();
    const me = makeMeResponse();
    mockFetchSequence(jsonResponse(200, me));

    renderApp('/');
    const toggle = await screen.findByRole('button', { name: messages.shell.toggleSidebar });
    fireEvent.click(toggle);

    expect(screen.getAllByRole('button', { name: messages.shell.toggleSidebar })).toHaveLength(1);

    const scrim = document.querySelector('.shell__scrim');
    expect(scrim).not.toBeNull();
    expect(scrim?.tagName).toBe('DIV');
    expect(scrim).toHaveAttribute('aria-hidden', 'true');
  });

  it('moves focus into the overlay on open, and Esc closes it and restores focus to the toggle', async () => {
    stubNarrowViewport();
    const me = makeMeResponse();
    mockFetchSequence(jsonResponse(200, me));

    renderApp('/');
    const toggle = await screen.findByRole('button', { name: messages.shell.toggleSidebar });
    fireEvent.click(toggle);

    const sidebar = screen.getByRole('navigation', { name: messages.app.name });
    expect(sidebar).toHaveAttribute('data-visible', 'true');
    const userMenuButton = await screen.findByRole('button', { name: messages.shell.userMenu });
    expect(userMenuButton).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(sidebar).toHaveAttribute('data-visible', 'false');
    expect(toggle).toHaveFocus();
  });

  it('traps Tab inside the open overlay instead of letting it escape the sidebar', async () => {
    stubNarrowViewport();
    const me = makeMeResponse();
    mockFetchSequence(jsonResponse(200, me));

    renderApp('/');
    const toggle = await screen.findByRole('button', { name: messages.shell.toggleSidebar });
    fireEvent.click(toggle);

    const userMenuButton = await screen.findByRole('button', { name: messages.shell.userMenu });
    expect(userMenuButton).toHaveFocus();

    fireEvent.keyDown(userMenuButton, { key: 'Tab' });
    expect(userMenuButton).toHaveFocus();

    fireEvent.keyDown(userMenuButton, { key: 'Tab', shiftKey: true });
    expect(userMenuButton).toHaveFocus();
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

  it('does not steal focus on first mount under StrictMode double-invocation', async () => {
    const me = makeMeResponse();
    mockFetchSequence(jsonResponse(200, me));

    renderApp('/', { strict: true });
    const heading = await screen.findByRole('heading', { name: messages.shell.boards });

    expect(heading).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
  });
});
