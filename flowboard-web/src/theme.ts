export type Theme = 'light' | 'dark';

/**
 * Resolves the initial theme from the OS preference and sets
 * `data-theme` on the document root, matching the PT tokens in
 * `styles/tokens.css` (CL-O2). A user-facing toggle lands in FB-03.
 */
export function applyInitialTheme(window: Window): Theme {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme: Theme = prefersDark ? 'dark' : 'light';
  window.document.documentElement.setAttribute('data-theme', theme);
  return theme;
}
