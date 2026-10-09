import { CARD_TITLE_MAX_LENGTH } from '@flowboard/shared';
import { describe, expect, it } from 'vitest';
import { COPY_SUFFIX, copyTitle } from './copy-title.js';

/** FB-06 §10 unit row: the " (copy)" fitting (C-12, AC 6). */

describe('copyTitle (C-12, AC 6)', () => {
  it('appends " (copy)" to a short title', () => {
    expect(copyTitle('Write launch post')).toBe('Write launch post (copy)');
  });

  it('keeps a title that lands exactly on the bound', () => {
    const title = 'x'.repeat(CARD_TITLE_MAX_LENGTH - COPY_SUFFIX.length);

    expect(copyTitle(title)).toBe(`${title}${COPY_SUFFIX}`);
    expect(copyTitle(title)).toHaveLength(CARD_TITLE_MAX_LENGTH);
  });

  it('shortens the original rather than dropping the suffix', () => {
    const title = 'x'.repeat(CARD_TITLE_MAX_LENGTH);
    const result = copyTitle(title);

    expect(result).toHaveLength(CARD_TITLE_MAX_LENGTH);
    expect(result.endsWith(COPY_SUFFIX)).toBe(true);
    expect(result).toBe(`${'x'.repeat(CARD_TITLE_MAX_LENGTH - COPY_SUFFIX.length)}${COPY_SUFFIX}`);
  });

  it('copies a copy, so the result is still bounded', () => {
    const once = copyTitle('x'.repeat(CARD_TITLE_MAX_LENGTH));
    const twice = copyTitle(once);

    expect(twice).toHaveLength(CARD_TITLE_MAX_LENGTH);
    expect(twice.endsWith(COPY_SUFFIX)).toBe(true);
  });

  it('never splits a surrogate pair when it truncates', () => {
    // 247 emoji is 494 UTF-16 code units, so a naive cut at 493 lands in the
    // middle of the last pair. The result keeps 492 units plus the suffix.
    const title = '😀'.repeat(247);
    const result = copyTitle(title);

    expect(result.endsWith(COPY_SUFFIX)).toBe(true);
    expect(result).toBe(`${'😀'.repeat(246)}${COPY_SUFFIX}`);
    // A lone surrogate does not survive a UTF-8 round trip; this one does.
    expect(Buffer.from(result, 'utf8').toString('utf8')).toBe(result);
    expect(result.length).toBeLessThanOrEqual(CARD_TITLE_MAX_LENGTH);
  });

  it('measures the bound in the same units the schema does', () => {
    // CardSummary re-validates the stored title, so the copy of a 250-emoji
    // title must still be at most 500 UTF-16 code units long.
    expect(copyTitle('😀'.repeat(250)).length).toBeLessThanOrEqual(CARD_TITLE_MAX_LENGTH);
  });

  it('honours a caller-supplied bound', () => {
    expect(copyTitle('Launch', 10)).toBe('Lau (copy)');
  });
});
