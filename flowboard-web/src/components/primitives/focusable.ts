const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute('aria-disabled') || element.getAttribute('aria-disabled') !== 'true',
  );
}

export interface TabTrapEvent {
  key: string;
  shiftKey: boolean;
  preventDefault: () => void;
}

/**
 * Shared Tab/Shift+Tab wrap logic for `Dialog` and the narrow-viewport
 * sidebar overlay (TAS-86/TAS-87): Tab from the last focusable element wraps
 * to the first, Shift+Tab from the first wraps to the last, and an empty
 * container swallows Tab entirely rather than letting focus escape.
 */
export function handleTabTrap(event: TabTrapEvent, container: HTMLElement): void {
  if (event.key !== 'Tab') {
    return;
  }
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }
  const first = focusable[0] as HTMLElement;
  const last = focusable[focusable.length - 1] as HTMLElement;
  const active = document.activeElement;

  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
