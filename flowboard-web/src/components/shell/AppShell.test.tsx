import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '../../i18n/messages';
import { makeBoardHydrated, makeMeResponse } from '../../test/fixtures';
import { jsonResponse, mockFetchSequence } from '../../test/mock-fetch';
import { renderApp } from '../../test/render-app';

/** `/` always fetches the sidebar board list after `GET /v1/me` (FB-04 §4 item 15). */
function boardsPage() {
  return jsonResponse(200, { items: [], nextCursor: null });
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('AppShell sidebar collapse (FS X-04, acceptance criterion 3)', () => {
  it('collapsing the sidebar persists across a reload', async () => {
    const me = makeMeResponse();
    mockFetchSequence(jsonResponse(200, me), boardsPage(), jsonResponse(200, me), boardsPage());

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
    mockFetchSequence(jsonResponse(200, me), boardsPage());

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
    mockFetchSequence(jsonResponse(200, me), boardsPage());

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
    mockFetchSequence(jsonResponse(200, me), boardsPage());

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
    mockFetchSequence(jsonResponse(200, me), boardsPage());

    renderApp('/');
    const toggle = await screen.findByRole('button', { name: messages.shell.toggleSidebar });
    fireEvent.click(toggle);

    const sidebar = screen.getByRole('navigation', { name: messages.app.name });
    expect(sidebar).toHaveAttribute('data-visible', 'true');
    // The first focusable control in the sidebar is now "+ Create board"
    // (FB-04 adds it ahead of the footer menu in DOM order).
    const createBoardButton = await screen.findByRole('button', {
      name: `+ ${messages.boards.create.label}`,
    });
    expect(createBoardButton).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(sidebar).toHaveAttribute('data-visible', 'false');
    expect(toggle).toHaveFocus();
  });

  it('traps Tab inside the open overlay instead of letting it escape the sidebar', async () => {
    stubNarrowViewport();
    const me = makeMeResponse();
    mockFetchSequence(jsonResponse(200, me), boardsPage());

    renderApp('/');
    const toggle = await screen.findByRole('button', { name: messages.shell.toggleSidebar });
    fireEvent.click(toggle);

    const createBoardButton = await screen.findByRole('button', {
      name: `+ ${messages.boards.create.label}`,
    });
    expect(createBoardButton).toHaveFocus();
    const userMenuButton = screen.getByRole('button', { name: messages.shell.userMenu });

    // "+ Create board" is first, the footer menu trigger is last: Tab from
    // the last wraps to the first and Shift+Tab from the first wraps to the
    // last (same `handleTabTrap` helper `Dialog` uses).
    fireEvent.keyDown(createBoardButton, { key: 'Tab', shiftKey: true });
    expect(userMenuButton).toHaveFocus();

    fireEvent.keyDown(userMenuButton, { key: 'Tab' });
    expect(createBoardButton).toHaveFocus();
  });

  it('one Esc closes only the topmost layer: the footer menu first, the overlay on a second press (TAS-87 F1)', async () => {
    stubNarrowViewport();
    const me = makeMeResponse();
    mockFetchSequence(jsonResponse(200, me), boardsPage());

    renderApp('/');
    const toggle = await screen.findByRole('button', { name: messages.shell.toggleSidebar });
    fireEvent.click(toggle);

    const sidebar = screen.getByRole('navigation', { name: messages.app.name });
    const userMenuButton = await screen.findByRole('button', { name: messages.shell.userMenu });

    fireEvent.click(userMenuButton);
    const menu = await screen.findByRole('menu', { name: messages.shell.userMenu });
    expect(menu).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('menu', { name: messages.shell.userMenu })).not.toBeInTheDocument();
    expect(sidebar).toHaveAttribute('data-visible', 'true');
    expect(userMenuButton).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(sidebar).toHaveAttribute('data-visible', 'false');
    expect(toggle).toHaveFocus();
  });
});

describe('AppShell initial focus (FS §10 tab order, TAS-73)', () => {
  // These render a board page rather than `/` (empty workspace): FB-04's
  // empty state deliberately autofocuses the create-board input (spec §4
  // item 15), which is its own, separately asserted behaviour
  // (`index.test.tsx`), not the "never steal focus" default this guards.
  it('does not steal focus from the skip link on first mount', async () => {
    const me = makeMeResponse();
    const hydrated = makeBoardHydrated();
    mockFetchSequence(jsonResponse(200, me), jsonResponse(200, hydrated), boardsPage());

    renderApp(`/boards/${hydrated.board.id}`);
    await screen.findByDisplayValue(hydrated.board.name);

    expect(document.activeElement).toBe(document.body);
  });

  it('does not steal focus on first mount under StrictMode double-invocation', async () => {
    const me = makeMeResponse();
    const hydrated = makeBoardHydrated();
    mockFetchSequence(jsonResponse(200, me), jsonResponse(200, hydrated), boardsPage());

    renderApp(`/boards/${hydrated.board.id}`, { strict: true });
    await screen.findByDisplayValue(hydrated.board.name);

    expect(document.activeElement).toBe(document.body);
  });
});
