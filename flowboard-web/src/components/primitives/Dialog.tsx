import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { useShortcut } from '../../hooks/useShortcut';
import { getFocusableElements, handleTabTrap } from './focusable';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  children: ReactNode;
  /** Non-destructive dialogs close on scrim click; `ConfirmDialog` does not (FB-03 spec AC 8). */
  closeOnScrim?: boolean;
}

/**
 * Modal dialog primitive (FS X-03, FS §8, FB-03 spec §3): traps focus, closes
 * on `Esc`, and restores focus to the element that opened it. `ConfirmDialog`
 * builds on this for destructive confirmations.
 */
export function Dialog({ open, onClose, titleId, children, closeOnScrim = true }: DialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useShortcut('Escape', onClose, open);

  // `useLayoutEffect`, not `useEffect`: focus must move synchronously in the
  // same commit that removes the dialog from the DOM, otherwise jsdom (and
  // some browsers) settle focus on `<body>` first and the restore never
  // takes visible effect.
  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    const focusable = container ? getFocusableElements(container) : [];
    (focusable[0] ?? container)?.focus();

    return () => {
      previouslyFocused.current?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    handleTabTrap(event, container);
  }

  return (
    <div
      className="dialog-overlay"
      onMouseDown={(event) => {
        if (closeOnScrim && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={containerRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </div>
  );
}
