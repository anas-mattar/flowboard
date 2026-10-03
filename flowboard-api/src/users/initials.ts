/**
 * Initials derivation (FS §5 `initials`, FB-02 §4 item 12).
 *
 * The first letters of the first two words, upper-cased. A single word gives
 * its first two letters. The result is always 1 or 2 characters, which is what
 * the PT `.avatar` circle is sized for.
 */

/** Longest value `user.initials` ever holds. */
export const INITIALS_MAX_LENGTH = 2 as const;

/**
 * Splits on any Unicode whitespace. Letters are taken with `Array.from` so a
 * name outside the Basic Multilingual Plane is not cut in half.
 */
export function deriveInitials(displayName: string): string {
  const words = displayName.split(/\s+/u).filter((word) => word.length > 0);

  if (words.length === 0) return '?';

  if (words.length === 1) {
    return Array.from(words[0] ?? '')
      .slice(0, INITIALS_MAX_LENGTH)
      .join('')
      .toLocaleUpperCase('en');
  }

  return words
    .slice(0, INITIALS_MAX_LENGTH)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toLocaleUpperCase('en');
}
