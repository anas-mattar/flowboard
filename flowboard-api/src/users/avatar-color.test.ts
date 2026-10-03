import { AVATAR_COLORS } from '@flowboard/shared';
import { describe, expect, it } from 'vitest';
import { newId } from '../db/id.js';
import { deriveAvatarColor } from './avatar-color.js';

/** FB-02 §10 unit row `users/avatar-color.test.ts`; covers AC 12. */

describe('deriveAvatarColor', () => {
  it('always returns a colour from the PT palette', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(AVATAR_COLORS).toContain(deriveAvatarColor(newId()));
    }
  });

  it('is deterministic for the same id', () => {
    const id = newId();

    expect(deriveAvatarColor(id)).toBe(deriveAvatarColor(id));
  });

  it('spreads consecutive UUID v7 ids across the whole palette', () => {
    // UUID v7 ids created back to back share a long prefix. A weak hash would
    // map them all onto one or two colours; this asserts it does not.
    const ids = Array.from({ length: 500 }, newId);
    const used = new Set(ids.map(deriveAvatarColor));

    expect(used.size).toBe(AVATAR_COLORS.length);
  });

  it('does not depend on the palette entry being the first one', () => {
    const counts = new Map<string, number>();

    for (let i = 0; i < 1000; i += 1) {
      const color = deriveAvatarColor(newId());
      counts.set(color, (counts.get(color) ?? 0) + 1);
    }

    // Uniform would be 200 each; allow a wide band so the test is not flaky.
    for (const color of AVATAR_COLORS) {
      expect(counts.get(color) ?? 0).toBeGreaterThan(100);
    }
  });
});
