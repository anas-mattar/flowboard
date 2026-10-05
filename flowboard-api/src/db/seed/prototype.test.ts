import { AVATAR_COLORS } from '@flowboard/shared';
import { describe, expect, it } from 'vitest';
import { SEED_USERS } from './prototype.js';

/**
 * TAS-79: the seed used to carry its own copy of the prototype hex values, so
 * darkening `AVATAR_COLORS` for WCAG AA (FS §8, TAS-74) left the five seeded
 * demo avatars on the old, failing colours. These tests pin the seed to the
 * shared palette so the drift cannot come back.
 */
describe('SEED_USERS avatar colours (FS §8, TAS-74)', () => {
  it('only uses colours from the shared palette', () => {
    for (const user of SEED_USERS) {
      expect(AVATAR_COLORS, `seed user ${user.key}`).toContain(user.avatarColor);
    }
  });

  it('keeps the prototype u1..u5 colour order', () => {
    expect(SEED_USERS.map((user) => user.avatarColor)).toStrictEqual(
      AVATAR_COLORS.slice(0, SEED_USERS.length),
    );
  });

  it('gives each seeded user a distinct colour', () => {
    const used = new Set(SEED_USERS.map((user) => user.avatarColor));

    expect(used.size).toBe(SEED_USERS.length);
  });
});
