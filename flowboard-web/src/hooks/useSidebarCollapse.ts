import { useCallback, useState } from 'react';

const STORAGE_KEY = 'flowboard:sidebarCollapsed';

function readStoredCollapsed(window: Window): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeStoredCollapsed(collapsed: boolean, window: Window): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(collapsed));
  } catch {
    // Storage can be unavailable; the collapse state still works for this session.
  }
}

/**
 * Persists the sidebar collapse state in `localStorage` (FB-03 spec §3,
 * CL-E13, acceptance criterion 3). Desktop-only: the mobile overlay state is
 * ephemeral and owned by `AppShell` directly.
 */
export function useSidebarCollapse(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => readStoredCollapsed(window));

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      writeStoredCollapsed(next, window);
      return next;
    });
  }, []);

  return [collapsed, toggle];
}
