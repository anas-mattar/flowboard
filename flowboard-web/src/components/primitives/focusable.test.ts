import { afterEach, describe, expect, it } from 'vitest';
import { getFocusableElements, handleTabTrap } from './focusable';

function makeContainer(buttonLabels: string[]): HTMLElement {
  const container = document.createElement('div');
  for (const label of buttonLabels) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    container.append(button);
  }
  document.body.append(container);
  return container;
}

function keyEvent(key: string, shiftKey = false) {
  let defaultPrevented = false;
  return {
    key,
    shiftKey,
    preventDefault: () => {
      defaultPrevented = true;
    },
    get defaultPrevented() {
      return defaultPrevented;
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('handleTabTrap (TAS-86/TAS-87 F2: real multi-element wrap coverage)', () => {
  it('wraps Tab from the last focusable element to the first', () => {
    const container = makeContainer(['First', 'Middle', 'Last']);
    const buttons = getFocusableElements(container);
    expect(buttons).toHaveLength(3);
    buttons[2]?.focus();

    const event = keyEvent('Tab');
    handleTabTrap(event, container);

    expect(document.activeElement).toBe(buttons[0]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('wraps Shift+Tab from the first focusable element to the last', () => {
    const container = makeContainer(['First', 'Middle', 'Last']);
    const buttons = getFocusableElements(container);
    buttons[0]?.focus();

    const event = keyEvent('Tab', true);
    handleTabTrap(event, container);

    expect(document.activeElement).toBe(buttons[2]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves focus and default behaviour alone when Tab is pressed from a middle element', () => {
    const container = makeContainer(['First', 'Middle', 'Last']);
    const buttons = getFocusableElements(container);
    buttons[1]?.focus();

    const event = keyEvent('Tab');
    handleTabTrap(event, container);

    expect(document.activeElement).toBe(buttons[1]);
    expect(event.defaultPrevented).toBe(false);
  });

  it('swallows Tab when the container has no focusable elements', () => {
    const container = document.createElement('div');
    document.body.append(container);

    const event = keyEvent('Tab');
    handleTabTrap(event, container);

    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores non-Tab keys', () => {
    const container = makeContainer(['First', 'Last']);
    const buttons = getFocusableElements(container);
    buttons[1]?.focus();

    const event = keyEvent('Escape');
    handleTabTrap(event, container);

    expect(document.activeElement).toBe(buttons[1]);
    expect(event.defaultPrevented).toBe(false);
  });
});
