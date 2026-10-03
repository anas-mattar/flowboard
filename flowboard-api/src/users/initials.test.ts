import { describe, expect, it } from 'vitest';
import { deriveInitials } from './initials.js';

/** FB-02 §10 unit row `users/initials.test.ts`; covers AC 12. */

describe('deriveInitials', () => {
  it.each([
    ['Anas Matar', 'AM'],
    ['Lena Fischer', 'LF'],
    ['Omar Haddad', 'OH'],
    ['Priya Nair', 'PN'],
    ['Tom Becker', 'TB'],
  ])('matches the prototype user %s', (name, expected) => {
    expect(deriveInitials(name)).toBe(expected);
  });

  it('takes the first two letters of a single word', () => {
    expect(deriveInitials('Prince')).toBe('PR');
  });

  it('ignores words after the second', () => {
    expect(deriveInitials('Ada King Lovelace')).toBe('AK');
  });

  it('collapses repeated and leading whitespace', () => {
    expect(deriveInitials('  ada   lovelace ')).toBe('AL');
  });

  it('upper-cases', () => {
    expect(deriveInitials('ada lovelace')).toBe('AL');
  });

  it('handles a one-letter name', () => {
    expect(deriveInitials('X')).toBe('X');
  });

  it('keeps an astral-plane character whole', () => {
    // A surrogate pair must not be split into half a code point.
    expect(Array.from(deriveInitials('𝒜da'))).toHaveLength(2);
  });

  it('falls back to ? for a name with no words', () => {
    // The route trims and rejects an empty display name before this is
    // reached; the fallback exists so the function is total.
    expect(deriveInitials('   ')).toBe('?');
  });

  it('never returns more than two characters', () => {
    for (const name of ['Ada', 'Ada Lovelace', 'A B C D', 'Augusta']) {
      expect(Array.from(deriveInitials(name)).length).toBeLessThanOrEqual(2);
    }
  });
});
