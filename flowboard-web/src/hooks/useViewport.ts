import { useEffect, useState } from 'react';

/**
 * True at and below `maxWidthPx` (FS §8 browser: responsive down to 768 px).
 * Backs the sidebar's overlay-vs-push behaviour in `AppShell`.
 */
export function useNarrowViewport(maxWidthPx: number): boolean {
  const query = `(max-width: ${String(maxWidthPx)}px)`;
  const [isNarrow, setIsNarrow] = useState<boolean>(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const listener = () => {
      setIsNarrow(media.matches);
    };
    listener();
    media.addEventListener('change', listener);
    return () => {
      media.removeEventListener('change', listener);
    };
  }, [query]);

  return isNarrow;
}
