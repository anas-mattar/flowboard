import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Node 22's experimental global `localStorage` shadows jsdom's own
// implementation and throws without a `--localstorage-file` flag; the theme
// and sidebar-collapse persistence (CL-E13) need a working synchronous store.
if (!window.localStorage || typeof window.localStorage.getItem !== 'function') {
  const store = new Map<string, string>();
  const memoryLocalStorage: Storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, 'localStorage', {
    value: memoryLocalStorage,
    writable: true,
    configurable: true,
  });
}

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
