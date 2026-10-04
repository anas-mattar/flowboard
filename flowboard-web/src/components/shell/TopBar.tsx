import type { ReactNode } from 'react';
import { useId } from 'react';
import type { UserTheme } from '@flowboard/shared';
import { messages } from '../../i18n/messages';

export interface TopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  theme: UserTheme;
  onCycleTheme: () => void;
  /** FB-04 fills this with the board title and star. */
  titleSlot?: ReactNode;
}

/**
 * Top bar (FS §4.2, FB-03 spec §3): renders the sidebar toggle and theme
 * toggle; search, filter, avatar stack and invite are `aria-disabled`
 * placeholders until FB-09/FB-13 (acceptance criterion 12).
 */
export function TopBar({
  sidebarOpen,
  onToggleSidebar,
  theme,
  onCycleTheme,
  titleSlot,
}: TopBarProps) {
  const comingSoonId = useId();

  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-btn"
        aria-expanded={sidebarOpen}
        aria-controls="app-sidebar"
        onClick={onToggleSidebar}
      >
        <span aria-hidden="true">&#9776;</span>
        <span className="visually-hidden">{messages.shell.toggleSidebar}</span>
      </button>
      <div className="topbar__title">{titleSlot}</div>
      <div className="topbar__spacer" />
      <span id={comingSoonId} className="visually-hidden">
        {messages.shell.comingSoon}
      </span>
      <button
        type="button"
        className="icon-btn icon-btn--placeholder"
        aria-disabled="true"
        aria-describedby={comingSoonId}
        onClick={(event) => {
          event.preventDefault();
        }}
      >
        {messages.shell.search}
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--placeholder"
        aria-disabled="true"
        aria-describedby={comingSoonId}
        onClick={(event) => {
          event.preventDefault();
        }}
      >
        {messages.shell.filter}
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--placeholder"
        aria-disabled="true"
        aria-describedby={comingSoonId}
        onClick={(event) => {
          event.preventDefault();
        }}
      >
        <span aria-hidden="true">&#128100;</span>
        <span className="visually-hidden">{messages.shell.members}</span>
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--placeholder"
        aria-disabled="true"
        aria-describedby={comingSoonId}
        onClick={(event) => {
          event.preventDefault();
        }}
      >
        {messages.shell.invite}
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={onCycleTheme}
        aria-label={`${messages.shell.theme.label}: ${messages.shell.theme[theme]}`}
      >
        <span aria-hidden="true">&#9681;</span>
      </button>
    </header>
  );
}
