import { describe, expect, it } from 'vitest';
import { bearerToken, originAllowed } from './plugin.js';

/** Unit cover for the two pure decisions in `requireAuth` (AC 6, AC 7). */

const WEB_ORIGIN = 'http://localhost:5173';

describe('bearerToken', () => {
  it('reads the token from a well-formed header', () => {
    expect(bearerToken('Bearer abc123_-~')).toBe('abc123_-~');
  });

  it('accepts any casing of the scheme and extra spaces', () => {
    expect(bearerToken('bearer abc')).toBe('abc');
    expect(bearerToken('BEARER   abc')).toBe('abc');
    expect(bearerToken('  Bearer abc  ')).toBe('abc');
  });

  it.each([
    ['no header', undefined],
    ['another scheme', 'Basic abc'],
    ['no token', 'Bearer'],
    ['an empty token', 'Bearer '],
    ['a token with a space in it', 'Bearer ab c'],
  ])('returns null for %s', (_label, header) => {
    expect(bearerToken(header)).toBeNull();
  });
});

describe('originAllowed', () => {
  it('exempts bearer requests entirely (AC 7)', () => {
    expect(originAllowed('POST', 'https://evil.test', 'bearer', WEB_ORIGIN)).toBe(true);
    expect(originAllowed('DELETE', 'null', 'bearer', WEB_ORIGIN)).toBe(true);
  });

  it('allows a safe method regardless of origin', () => {
    expect(originAllowed('GET', 'https://evil.test', 'cookie', WEB_ORIGIN)).toBe(true);
    expect(originAllowed('HEAD', 'https://evil.test', 'cookie', WEB_ORIGIN)).toBe(true);
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE', 'post', 'patch'])(
    'checks the origin on a cookie-authenticated %s',
    (method) => {
      expect(originAllowed(method, WEB_ORIGIN, 'cookie', WEB_ORIGIN)).toBe(true);
      expect(originAllowed(method, 'https://evil.test', 'cookie', WEB_ORIGIN)).toBe(false);
    },
  );

  it('allows a mutation with no Origin header at all', () => {
    // SameSite=Lax already blocks the cross-site form post this would be;
    // refusing here would break curl and server-side callers holding a cookie.
    expect(originAllowed('POST', undefined, 'cookie', WEB_ORIGIN)).toBe(true);
  });

  it('refuses the literal null origin on a cookie mutation', () => {
    expect(originAllowed('POST', 'null', 'cookie', WEB_ORIGIN)).toBe(false);
  });

  it('refuses an origin that merely starts with the web origin', () => {
    expect(originAllowed('POST', `${WEB_ORIGIN}.evil.test`, 'cookie', WEB_ORIGIN)).toBe(false);
  });
});
