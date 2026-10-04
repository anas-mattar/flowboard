import { useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useSidebarCollapse } from '../../hooks/useSidebarCollapse';
import { useSession } from '../../hooks/useSession';
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
  const pathname = useRouterState({ select: (routerState) => routerState.location.pathname });

  useEffect(() => {
    headingRef.current?.focus();
  }, [pathname]);

  if (!session.data) {
    return null;
  }

  const sidebarVisible = isNarrow ? mobileOpen : !collapsed;

  function toggleSidebar() {
    if (isNarrow) {
      setMobileOpen((current) => !current);
    } else {
      toggleCollapsed();
    }
  }

  const { user, currentWorkspace, workspaces } = session.data;
  const membership = workspaces.find((entry) => entry.workspace.id === currentWorkspace.id);
  const roleLabel =
    membership?.role === 'admin' ? messages.role.workspaceAdmin : messages.role.member;

  return (
    <div className="shell">
      <a className="shell__skip-link" href="#main-content">
        {messages.app.skipToContent}
      </a>
      {isNarrow && sidebarVisible ? (
        <button
          type="button"
          className="shell__scrim"
          aria-label={messages.shell.toggleSidebar}
          onClick={() => {
            setMobileOpen(false);
          }}
        />
      ) : null}
      <Sidebar
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
      />
      <div className="shell__column">
        <TopBar
          sidebarOpen={sidebarVisible}
          onToggleSidebar={toggleSidebar}
          theme={theme.preference}
          onCycleTheme={theme.cycleTheme}
          titleSlot={titleSlot}
        />
        <main id="main-content" className="shell__main">
          <h1 ref={headingRef} className="visually-hidden" tabIndex={-1}>
            {title}
          </h1>
          {children}
        </main>
      </div>
    </div>
  );
}
