import { useEffect } from 'react';

/**
 * Global keyboard shortcut registry (FS X-03, FB-03 spec §3). FB-03 registers
 * only `Esc` for dialogs and popovers; FB-13 adds `/` and `F` for search and
 * filter on top of this same hook.
 */
export function useShortcut(
  key: string,
  handler: (event: KeyboardEvent) => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    function listener(event: KeyboardEvent) {
      if (event.key === key) {
        handler(event);
      }
    }
    window.addEventListener('keydown', listener);
    return () => {
      window.removeEventListener('keydown', listener);
    };
  }, [key, handler, enabled]);
}
