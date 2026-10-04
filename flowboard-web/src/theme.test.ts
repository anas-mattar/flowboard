import { afterEach, describe, expect, it } from 'vitest';
import {
  applyInitialTheme,
  applyTheme,
  nextTheme,
  readStoredTheme,
  writeStoredTheme,
} from './theme';

function fakeWindow(prefersDark: boolean): Window {
  const store = new Map<string, string>();
  return {
    matchMedia: () => ({ matches: prefersDark }) as MediaQueryList,
    document: window.document,
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
  } as unknown as Window;
}

afterEach(() => {
  window.localStorage.clear();
});

describe('applyTheme', () => {
  it('applies "light" and "dark" directly regardless of OS preference', () => {
    expect(applyTheme('light', fakeWindow(true))).toBe('light');
    expect(window.document.documentElement.getAttribute('data-theme')).toBe('light');

    expect(applyTheme('dark', fakeWindow(false))).toBe('dark');
    expect(window.document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('resolves "system" against the OS preference', () => {
    expect(applyTheme('system', fakeWindow(true))).toBe('dark');
    expect(applyTheme('system', fakeWindow(false))).toBe('light');
  });
});

describe('readStoredTheme / writeStoredTheme (CL-E13 localStorage mirror)', () => {
  it('round-trips a valid preference', () => {
    writeStoredTheme('dark', window);
    expect(readStoredTheme(window)).toBe('dark');
  });

  it('returns undefined when nothing is stored or the value is invalid', () => {
    expect(readStoredTheme(window)).toBeUndefined();
    window.localStorage.setItem('flowboard:theme', 'sepia');
    expect(readStoredTheme(window)).toBeUndefined();
  });
});

describe('applyInitialTheme (acceptance criterion 2)', () => {
  it('follows prefers-color-scheme when nothing is stored', () => {
    expect(applyInitialTheme(fakeWindow(true))).toBe('dark');
  });

  it('uses the stored preference over the OS preference once one exists', () => {
    const win = fakeWindow(true);
    writeStoredTheme('light', win);
    expect(applyInitialTheme(win)).toBe('light');
  });
});

describe('nextTheme', () => {
  it('cycles light -> dark -> system -> light', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
    expect(nextTheme('system')).toBe('light');
  });
});
