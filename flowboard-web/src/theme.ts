import type { UserTheme } from '@flowboard/shared';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'flowboard:theme';

/**
 * Reads the mirrored theme preference from `localStorage` (CL-E13). Used
 * before any session is known so `data-theme` is correct before first paint.
 */
export function readStoredTheme(window: Window): UserTheme | undefined {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : undefined;
  } catch {
    // Storage can throw (private browsing, disabled cookies); fall back to no stored value.
    return undefined;
  }
}

/** Mirrors the user's theme preference to `localStorage` (CL-E13). */
export function writeStoredTheme(preference: UserTheme, window: Window): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable; the in-memory/applied theme still works for this session.
  }
}

/** Cycles light -> dark -> system -> light (FS §4.2 top-bar theme toggle). */
export function nextTheme(current: UserTheme): UserTheme {
  const order: UserTheme[] = ['light', 'dark', 'system'];
  const index = order.indexOf(current);
  return order[(index + 1) % order.length] as UserTheme;
}

/**
 * Resolves the theme to apply before any session is known: the mirrored
 * `localStorage` preference if one exists, otherwise `system` (CL-E13,
 * acceptance criterion 2). Sets `data-theme` on the document root before
 * first paint, matching the PT tokens in `styles/tokens.css` (CL-O2).
 */
export function applyInitialTheme(window: Window): Theme {
  const preference = readStoredTheme(window) ?? 'system';
  return applyTheme(preference, window);
}

/**
 * Applies a theme preference (FB-02 spec §5: "Theme is applied from
 * `GET /v1/me` on load"). `'system'` resolves against the OS preference at
 * the moment it is applied.
 */
export function applyTheme(preference: UserTheme, window: Window): Theme {
  const theme: Theme =
    preference === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : preference;
  window.document.documentElement.setAttribute('data-theme', theme);
  return theme;
}
