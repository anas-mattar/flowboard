import { useRouterState } from '@tanstack/react-router';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { getFocusableElements } from '../primitives/focusable';
import { useSidebarCollapse } from '../../hooks/useSidebarCollapse';
import { useSession } from '../../hooks/useSession';
import { useShortcut } from '../../hooks/useShortcut';
import { useSignOut } from '../../hooks/useSignOut';
import { useTheme } from '../../hooks/useTheme';
import { useNarrowViewport } from '../../hooks/useViewport';
import { messages } from '../../i18n/messages';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const MOBILE_BREAKPOINT_PX = 768;

export interface AppShellProps {
  children: ReactNode;
  /** FB-04 fills this with the board title and star; defaults to the "Boards" heading. */
  title?: string;
  titleSlot?: ReactNode;
}

/**
 * FlowBoard app frame (FB-03 spec §3): sidebar, top bar and the content
 * outlet. Owns the sidebar collapse/overlay state and the theme, and moves
 * focus to the page heading on route change (spec §5 "Focus behaviour").
 */
export function AppShell({ children, title = messages.shell.boards, titleSlot }: AppShellProps) {
  const session = useSession();
  const signOut = useSignOut();
  const [collapsed, toggleCollapsed] = useSidebarCollapse();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isNarrow = useNarrowViewport(MOBILE_BREAKPOINT_PX);
  const theme = useTheme(session.data?.user.theme);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const previousPathname = useRef<string | null>(null);
  const pathname = useRouterState({ select: (routerState) => routerState.location.pathname });

  useEffect(() => {
    if (previousPathname.current !== null && previousPathname.current !== pathname) {
      headingRef.current?.focus();
    }
    previousPathname.current = pathname;
  }, [pathname]);

  const sidebarVisible = isNarrow ? mobileOpen : !collapsed;
  const overlayOpen = isNarrow && mobileOpen;

  // Closes the narrow-viewport overlay on navigation (TAS-86 clarification,
  // FB-03 spec §5): the overlay-close effect below then returns focus to ☰.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useShortcut(
    'Escape',
    () => {
      setMobileOpen(false);
    },
    overlayOpen,
  );

  // A plain `useEffect`, not `useLayoutEffect`: the close-side cleanup must
  // run after React's commit-phase focus/selection restoration (which
  // otherwise re-focuses whatever was active in the sidebar before this
  // commit, clobbering our own `.focus()` call if it runs during the layout
  // phase instead) (TAS-86).
  useEffect(() => {
    if (!overlayOpen) {
      return;
    }
    const container = sidebarRef.current;
    const focusable = container ? getFocusableElements(container) : [];
    focusable[0]?.focus();

    return () => {
      toggleButtonRef.current?.focus();
    };
  }, [overlayOpen]);

  if (!session.data) {
    return null;
  }

  function toggleSidebar() {
    if (isNarrow) {
      setMobileOpen((current) => !current);
    } else {
      toggleCollapsed();
    }
  }

  // Traps Tab/Shift+Tab inside the sidebar while the narrow-viewport overlay
  // is open (TAS-86 clarification, same wrap logic as `Dialog.tsx`); never
  // wired up at desktop widths.
  function handleSidebarKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') {
      return;
    }
    const container = sidebarRef.current;
    if (!container) {
      return;
    }
    const focusable = getFocusableElements(container);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const { user, currentWorkspace, workspaces } = session.data;
  const membership = workspaces.find((entry) => entry.workspace.id === currentWorkspace.id);
  const roleLabel =
    membership?.role === 'admin' ? messages.role.workspaceAdmin : messages.role.member;

  return (
    <div className="shell">
      <a className="shell__skip-link" href="#main-content" tabIndex={0}>
        {messages.app.skipToContent}
      </a>
      {isNarrow && sidebarVisible ? (
        <div
          className="shell__scrim"
          aria-hidden="true"
          onMouseDown={() => {
            setMobileOpen(false);
          }}
        />
      ) : null}
      <TopBar
        sidebarOpen={sidebarVisible}
        onToggleSidebar={toggleSidebar}
        theme={theme.preference}
        onCycleTheme={theme.cycleTheme}
        titleSlot={titleSlot}
        toggleButtonRef={toggleButtonRef}
      />
      <Sidebar
        ref={sidebarRef}
        visible={sidebarVisible}
        workspaceName={currentWorkspace.name}
        displayName={user.displayName}
        initials={user.initials}
        avatarColor={user.avatarColor}
        roleLabel={roleLabel}
        theme={theme.preference}
        onThemeChange={theme.setTheme}
        onSignOut={() => {
          void signOut();
        }}
        onKeyDown={overlayOpen ? handleSidebarKeyDown : undefined}
      />
      <main id="main-content" className="shell__main">
        <h1 ref={headingRef} className="visually-hidden" tabIndex={-1}>
          {title}
        </h1>
        {children}
      </main>
    </div>
  );
}
