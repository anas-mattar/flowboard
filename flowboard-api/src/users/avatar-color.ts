import { createHash } from 'node:crypto';
import { AVATAR_COLORS, type AvatarColor } from '@flowboard/shared';

/**
 * Avatar colour derivation (FS §5 `avatar_color`, FB-02 §4 item 12).
 *
 * Deterministic from the user id, so the same person is always the same
 * colour on every device and nothing has to be stored before the user picks
 * one (they never do in MVP). SHA-256 rather than a cheap string hash because
 * UUID v7 ids share a long time-ordered prefix and would otherwise bunch into
 * one or two palette entries for users created in the same millisecond range.
 */
export function deriveAvatarColor(userId: string): AvatarColor {
  const digest = createHash('sha256').update(userId, 'utf8').digest();
  // The low byte of the digest, reduced over the palette. `AVATAR_COLORS` is
  // non-empty, so the index is always in range.
  const index = (digest[digest.length - 1] ?? 0) % AVATAR_COLORS.length;

  return AVATAR_COLORS[index] ?? AVATAR_COLORS[0];
}
