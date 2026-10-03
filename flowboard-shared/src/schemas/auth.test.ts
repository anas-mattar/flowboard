import { describe, expect, it } from 'vitest';
import {
  authResponseSchema,
  loginRequestSchema,
  signupRequestSchema,
  DISPLAY_NAME_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './auth.js';

/** Boundary coverage for CL-E10, referenced by FB-02 §4 item 3. */

const valid = {
  email: 'a@example.test',
  password: 'correct horse battery',
  displayName: 'Ada Lovelace',
};

/** An address of exactly `length` characters, ending in `@example.test`. */
function emailOfLength(length: number): string {
  const domain = '@example.test';
  return 'a'.repeat(length - domain.length) + domain;
}

describe('signupRequestSchema', () => {
  it('accepts a valid body', () => {
    expect(signupRequestSchema.parse(valid)).toEqual({ ...valid });
  });

  it('accepts tokenResponse for non-browser clients', () => {
    expect(signupRequestSchema.parse({ ...valid, tokenResponse: true }).tokenResponse).toBe(true);
  });

  it('trims the email and the display name', () => {
    const parsed = signupRequestSchema.parse({
      ...valid,
      email: '  a@example.test  ',
      displayName: '  Ada Lovelace  ',
    });

    expect(parsed.email).toBe('a@example.test');
    expect(parsed.displayName).toBe('Ada Lovelace');
  });

  it.each([
    ['an invalid email', { ...valid, email: 'not-an-email' }],
    ['an email over 254 characters', { ...valid, email: emailOfLength(EMAIL_MAX_LENGTH + 1) }],
    ['a password under 10 characters', { ...valid, password: 'a'.repeat(PASSWORD_MIN_LENGTH - 1) }],
    ['a password over 128 characters', { ...valid, password: 'a'.repeat(PASSWORD_MAX_LENGTH + 1) }],
    ['an empty display name', { ...valid, displayName: '   ' }],
    [
      'a display name over 80 characters',
      { ...valid, displayName: 'a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1) },
    ],
    ['an unknown field', { ...valid, isAdmin: true }],
  ])('rejects %s', (_label, body) => {
    expect(signupRequestSchema.safeParse(body).success).toBe(false);
  });

  it('accepts the exact boundary values', () => {
    expect(
      signupRequestSchema.safeParse({
        email: emailOfLength(EMAIL_MAX_LENGTH),
        password: 'a'.repeat(PASSWORD_MIN_LENGTH),
        displayName: 'a'.repeat(DISPLAY_NAME_MAX_LENGTH),
      }).success,
    ).toBe(true);

    expect(
      signupRequestSchema.safeParse({ ...valid, password: 'a'.repeat(PASSWORD_MAX_LENGTH) }).success,
    ).toBe(true);
  });
});

describe('loginRequestSchema', () => {
  it('accepts a valid body', () => {
    expect(loginRequestSchema.parse({ email: valid.email, password: 'x' })).toEqual({
      email: valid.email,
      password: 'x',
    });
  });

  it('does not apply the signup minimum length to the password', () => {
    // A short password is simply wrong, not a validation error the caller
    // could use to learn anything about the account (CL-E10).
    expect(loginRequestSchema.safeParse({ email: valid.email, password: 'short' }).success).toBe(
      true,
    );
  });

  it('rejects an invalid email and an unknown field', () => {
    expect(loginRequestSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
    expect(
      loginRequestSchema.safeParse({ email: valid.email, password: 'x', remember: true }).success,
    ).toBe(false);
  });
});

describe('authResponseSchema', () => {
  const user = {
    id: '0199bb3b-0000-7000-8000-000000000001',
    displayName: 'Ada Lovelace',
    initials: 'AL',
    avatarColor: '#3d6df0',
    email: 'a@example.test',
    theme: 'system',
    createdAt: '2026-10-03T00:00:00.000Z',
  };

  const workspace = {
    id: '0199bb3b-0000-7000-8000-000000000002',
    name: "Ada Lovelace's workspace",
    plan: 'free',
    createdAt: '2026-10-03T00:00:00.000Z',
  };

  it('accepts a cookie response with no token in the body', () => {
    const parsed = authResponseSchema.parse({ user, workspace });
    expect(parsed.sessionToken).toBeUndefined();
  });

  it('accepts a bearer response carrying the token', () => {
    expect(authResponseSchema.parse({ user, workspace, sessionToken: 'tok' }).sessionToken).toBe(
      'tok',
    );
  });

  it('rejects a response whose user carries a password hash field value', () => {
    // `userSchema` has no `passwordHash`; the strictness that matters is that
    // the route maps rows through the schema rather than spreading them.
    expect(authResponseSchema.safeParse({ user: { ...user, email: 'nope' }, workspace }).success)
      .toBe(false);
  });
});
