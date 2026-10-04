import type { ReactNode } from 'react';
import type { UserTheme } from '@flowboard/shared';
import { messages } from '../../i18n/messages';
import { UserMenu } from './UserMenu';

export interface SidebarProps {
  visible: boolean;
  workspaceName: string;
  displayName: string;
  initials: string;
  avatarColor: string;
  roleLabel: string;
  theme: UserTheme;
  onThemeChange: (theme: UserTheme) => void;
  onSignOut: () => void;
  /** FB-04 renders board rows here. */
  boardsSlot?: ReactNode;
}

export function Sidebar({
  visible,
  workspaceName,
  displayName,
  initials,
  avatarColor,
  roleLabel,
  theme,
  onThemeChange,
  onSignOut,
  boardsSlot,
}: SidebarProps) {
  return (
    <nav id="app-sidebar" className="sidebar" aria-label={messages.app.name} data-visible={visible}>
      <div className="sidebar__brand">
        <span className="sidebar__mark" aria-hidden="true">
          F
        </span>
        <span className="sidebar__brand-text">
          <b>{messages.app.name}</b>
          <small>{workspaceName}</small>
        </span>
      </div>
      <div className="sidebar__section-label">{messages.shell.boards}</div>
      <div className="sidebar__boards">{boardsSlot}</div>
      <div className="sidebar__footer">
        <span className="avatar" style={{ backgroundColor: avatarColor }} aria-hidden="true">
          {initials}
        </span>
        <span className="sidebar__who">
          <span className="sidebar__who-name">{displayName}</span>
          <small className="sidebar__who-role">{roleLabel}</small>
        </span>
        <UserMenu theme={theme} onThemeChange={onThemeChange} onSignOut={onSignOut} />
      </div>
    </nav>
  );
}
