import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeResponse, UserTheme } from '@flowboard/shared';
import { patchMe } from '../api/auth';
import { applyTheme, nextTheme, readStoredTheme, writeStoredTheme, type Theme } from '../theme';
import { meQueryKey } from './useSession';

interface UseThemeResult {
  /** The raw preference ('light' | 'dark' | 'system'), for the menu's radio group. */
  preference: UserTheme;
  /** The resolved theme actually applied to `data-theme` ('light' | 'dark'). */
  resolvedTheme: Theme;
  /** Cycles light -> dark -> system (FS §4.2 top-bar toggle). */
  cycleTheme: () => void;
  /** Sets an explicit preference (sidebar footer menu radio group). */
  setTheme: (preference: UserTheme) => void;
}

/**
 * Owns the theme preference for the signed-in shell (FB-03 spec §3, CL-E13):
 * reconciles the `localStorage` mirror with `GET /v1/me`, applies `data-theme`
 * instantly on every change, follows `prefers-color-scheme` while the
 * preference is `'system'`, and persists changes with `PATCH /v1/me` plus the
 * `localStorage` mirror.
 */
export function useTheme(sessionTheme: UserTheme | undefined): UseThemeResult {
  const queryClient = useQueryClient();
  const [preference, setPreference] = useState<UserTheme>(
    () => sessionTheme ?? readStoredTheme(window) ?? 'system',
  );
  const [resolvedTheme, setResolvedTheme] = useState<Theme>(() => applyTheme(preference, window));
  const reconciledSessionTheme = useRef<UserTheme | undefined>(undefined);

  // Reconciles with the server's value once per session load, without
  // overriding a change the user makes locally afterwards in the same tab.
  useEffect(() => {
    if (sessionTheme && reconciledSessionTheme.current !== sessionTheme) {
      reconciledSessionTheme.current = sessionTheme;
      setPreference(sessionTheme);
    }
  }, [sessionTheme]);

  useEffect(() => {
    setResolvedTheme(applyTheme(preference, window));
    writeStoredTheme(preference, window);
  }, [preference]);

  useEffect(() => {
    if (preference !== 'system') {
      return;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      setResolvedTheme(applyTheme('system', window));
    };
    media.addEventListener('change', listener);
    return () => {
      media.removeEventListener('change', listener);
    };
  }, [preference]);

  const setTheme = useCallback(
    (next: UserTheme) => {
      setPreference(next);
      patchMe({ theme: next })
        .then((user) => {
          queryClient.setQueryData<MeResponse>(meQueryKey, (current) =>
            current ? { ...current, user } : current,
          );
        })
        .catch(() => {
          // Best-effort persistence: the theme already applied locally and is
          // mirrored in localStorage; a failed PATCH is retried on next change.
        });
    },
    [queryClient],
  );

  const cycleTheme = useCallback(() => {
    setTheme(nextTheme(preference));
  }, [preference, setTheme]);

  return { preference, resolvedTheme, cycleTheme, setTheme };
}
