import type { UserTheme } from '@flowboard/shared';

export type Theme = 'light' | 'dark';

/**
 * Resolves the initial theme from the OS preference and sets
 * `data-theme` on the document root, matching the PT tokens in
 * `styles/tokens.css` (CL-O2). Used before a session is known; once
 * `GET /v1/me` resolves, `applyTheme` takes over with the user's stored
 * preference (CL-E13). A user-facing toggle lands in FB-03.
 */
export function applyInitialTheme(window: Window): Theme {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme: Theme = prefersDark ? 'dark' : 'light';
  window.document.documentElement.setAttribute('data-theme', theme);
  return theme;
}

/**
 * Applies the signed-in user's theme preference (FB-02 spec §5: "Theme is
 * applied from `GET /v1/me` on load"). `'system'` resolves against the OS
 * preference at the moment it is applied.
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
