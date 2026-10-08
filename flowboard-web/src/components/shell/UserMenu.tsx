import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { UserTheme } from '@flowboard/shared';
import { useShortcut } from '../../hooks/useShortcut';
import { messages } from '../../i18n/messages';

const THEME_OPTIONS: readonly UserTheme[] = ['light', 'dark', 'system'];

export interface UserMenuProps {
  theme: UserTheme;
  onThemeChange: (theme: UserTheme) => void;
  onSignOut: () => void;
  /**
   * Whether the sidebar footer housing this menu is currently visible
   * (TAS-94): the sidebar renders unconditionally, with `visible` a CSS-only
   * concern, so a hidden footer must still close its own popover and drop
   * its Esc-stack token. Without this, closing the narrow-viewport overlay
   * while the menu is open leaves the menu's token registered, and
   * reopening the overlay re-pushes the shell's token above it — inverting
   * which layer Esc closes first.
   */
  visible: boolean;
}

/**
 * Sidebar footer menu (FS §4.1, FB-03 spec §5): a `menu` with arrow-key
 * navigation holding the theme radio group and Sign out.
 */
export function UserMenu({ theme, onThemeChange, onSignOut, visible }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) {
      setOpen(false);
    }
  }, [visible]);

  useShortcut(
    'Escape',
    () => {
      setOpen(false);
      buttonRef.current?.focus();
    },
    open,
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const firstItem = menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]');
      firstItem?.focus();
    }
  }, [open]);

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    event.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [],
    );
    if (items.length === 0) {
      return;
    }
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (currentIndex + delta + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  return (
    <div className="user-menu">
      <button
        ref={buttonRef}
        type="button"
        className="user-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <span aria-hidden="true">&#8942;</span>
        <span className="visually-hidden">{messages.shell.userMenu}</span>
      </button>
      {open ? (
        <div
          ref={menuRef}
          className="user-menu__popover"
          role="menu"
          aria-label={messages.shell.userMenu}
          onKeyDown={handleMenuKeyDown}
        >
          <div className="user-menu__group" role="group" aria-label={messages.shell.theme.label}>
            {THEME_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={theme === option}
                className="user-menu__item"
                onClick={() => {
                  onThemeChange(option);
                }}
              >
                {messages.shell.theme[option]}
              </button>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            className="user-menu__item"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            {messages.auth.signOut}
          </button>
        </div>
      ) : null}
    </div>
  );
}
