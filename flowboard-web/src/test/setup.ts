import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom does not implement matchMedia; `theme.ts` calls it for every
// signed-in session (`applyTheme`) and on initial load (`applyInitialTheme`).
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

// Testing Library's auto-cleanup only self-registers when it detects global
// test hooks (`vitest.config.ts` here does not set `test.globals: true`), so
// it is wired up explicitly to unmount between tests in this file.
afterEach(() => {
  cleanup();
});
