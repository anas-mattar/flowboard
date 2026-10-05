import { useEffect, useRef } from 'react';

/**
 * Per-key layer stacks (TAS-87 / F1): when two `useShortcut` registrations for
 * the same key are enabled at once (e.g. the sidebar footer menu open inside
 * the narrow-viewport overlay), only the most-recently-enabled ("topmost")
 * registration fires. Without this a single Esc press closed both the menu
 * and the overlay in one go.
 */
const layerStacks = new Map<string, symbol[]>();

function pushLayer(key: string, token: symbol) {
  const stack = layerStacks.get(key) ?? [];
  stack.push(token);
  layerStacks.set(key, stack);
}

function popLayer(key: string, token: symbol) {
  const stack = layerStacks.get(key);
  if (!stack) {
    return;
  }
  const index = stack.lastIndexOf(token);
  if (index !== -1) {
    stack.splice(index, 1);
  }
  if (stack.length === 0) {
    layerStacks.delete(key);
  }
}

function isTopLayer(key: string, token: symbol): boolean {
  const stack = layerStacks.get(key);
  return stack !== undefined && stack[stack.length - 1] === token;
}

/**
 * Global keyboard shortcut registry (FS X-03, FB-03 spec §3). FB-03 registers
 * only `Esc` for dialogs and popovers; FB-13 adds `/` and `F` for search and
 * filter on top of this same hook.
 */
export function useShortcut(
  key: string,
  handler: (event: KeyboardEvent) => void,
  enabled = true,
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  const tokenRef = useRef<symbol | null>(null);
  if (tokenRef.current === null) {
    tokenRef.current = Symbol('shortcut-layer');
  }

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const token = tokenRef.current as symbol;
    pushLayer(key, token);

    function listener(event: KeyboardEvent) {
      if (event.key === key && isTopLayer(key, token)) {
        handlerRef.current(event);
      }
    }
    window.addEventListener('keydown', listener);
    return () => {
      window.removeEventListener('keydown', listener);
      popLayer(key, token);
    };
    // `handler` is intentionally omitted: it's read through `handlerRef` so
    // identity changes on every render don't re-push this registration to
    // the top of the stack.
  }, [key, enabled]);
}
