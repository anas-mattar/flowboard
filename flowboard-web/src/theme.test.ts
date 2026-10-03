import { describe, expect, it } from 'vitest';
import { applyTheme } from './theme';

function fakeWindow(prefersDark: boolean): Window {
  return {
    matchMedia: () => ({ matches: prefersDark }) as MediaQueryList,
    document: window.document,
  } as unknown as Window;
}

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
