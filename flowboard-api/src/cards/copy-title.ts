import { CARD_TITLE_MAX_LENGTH } from '@flowboard/shared';

/**
 * The title of a copied card (C-12, CL-A13, FB-06 AC 6).
 *
 * C-12 asks for `"{title} (copy)"`. The stored title is bounded at 500
 * characters, and the original may already be at that bound, so the *original*
 * is shortened until the whole result fits rather than the suffix being
 * dropped: a copy that does not say "(copy)" is indistinguishable from the card
 * it was copied from, which is the one thing the feature exists to avoid.
 *
 * Pure, so FB-06 §10 can unit-test the fitting without a database.
 */

/** The suffix C-12 fixes. Exported so the test states the rule once. */
export const COPY_SUFFIX = ' (copy)' as const;

/**
 * Truncates to at most `maxLength` **UTF-16 code units**, which is the unit
 * `CARD_TITLE_MAX_LENGTH` and the Zod `.max()` behind it both count, so the
 * result always re-validates.
 *
 * The cut is then stepped back by one when it would land between a surrogate
 * pair, so shortening a title that ends in an emoji or any astral character
 * cannot leave half a pair behind — that would be a lone surrogate in a `text`
 * column and an unrenderable character in the UI.
 *
 * Combining marks are not handled: a title cut immediately after a base
 * character keeps the base and drops its accent, which is a visual change but
 * never an invalid string. Grapheme-accurate truncation would need
 * `Intl.Segmenter` for a case that only arises at exactly the bound.
 */
function truncateToCodeUnits(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const lastRetained = text.charCodeAt(maxLength - 1);
  const isHighSurrogate = lastRetained >= 0xd800 && lastRetained <= 0xdbff;

  return text.slice(0, isHighSurrogate ? maxLength - 1 : maxLength);
}

export function copyTitle(title: string, maxLength: number = CARD_TITLE_MAX_LENGTH): string {
  const available = maxLength - COPY_SUFFIX.length;

  // Defensive: a bound shorter than the suffix cannot carry it. Not reachable
  // with CARD_TITLE_MAX_LENGTH = 500; the test pins the behaviour anyway.
  if (available <= 0) return truncateToCodeUnits(title, maxLength);

  return `${truncateToCodeUnits(title, available)}${COPY_SUFFIX}`;
}
