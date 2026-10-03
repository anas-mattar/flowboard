import { describe, expect, it } from 'vitest';
import { LOGIN_EMAIL_RULE, LOGIN_IP_RULE, SIGNUP_IP_RULE } from '../config/rate-limits.js';
import { RateLimiter, rateLimitKey } from './rate-limit.js';

/** Unit cover for CL-E11; the HTTP behaviour is `test/auth.ratelimit.test.ts`. */

describe('RateLimiter', () => {
  it('allows exactly `limit` requests then blocks', () => {
    const limiter = new RateLimiter();
    const rule = { limit: 3, windowMs: 1000 };

    expect(limiter.consume(rule, 'k', 0).allowed).toBe(true);
    expect(limiter.consume(rule, 'k', 0).allowed).toBe(true);
    expect(limiter.consume(rule, 'k', 0).allowed).toBe(true);
    expect(limiter.consume(rule, 'k', 0).allowed).toBe(false);
  });

  it('reports whole seconds until the window resets, at least 1', () => {
    const limiter = new RateLimiter();
    const rule = { limit: 1, windowMs: 15 * 60_000 };

    limiter.consume(rule, 'k', 0);

    expect(limiter.consume(rule, 'k', 0).retryAfterSeconds).toBe(900);
    expect(limiter.consume(rule, 'k', 15 * 60_000 - 1).retryAfterSeconds).toBe(1);
  });

  it('opens a fresh window once the old one ends', () => {
    const limiter = new RateLimiter();
    const rule = { limit: 1, windowMs: 1000 };

    expect(limiter.consume(rule, 'k', 0).allowed).toBe(true);
    expect(limiter.consume(rule, 'k', 500).allowed).toBe(false);
    expect(limiter.consume(rule, 'k', 1000).allowed).toBe(true);
  });

  it('does not extend the penalty when a blocked client keeps trying', () => {
    const limiter = new RateLimiter();
    const rule = { limit: 1, windowMs: 1000 };

    limiter.consume(rule, 'k', 0);
    limiter.consume(rule, 'k', 100);
    limiter.consume(rule, 'k', 200);

    expect(limiter.consume(rule, 'k', 1000).allowed).toBe(true);
  });

  it('counts keys independently', () => {
    const limiter = new RateLimiter();
    const rule = { limit: 1, windowMs: 1000 };

    expect(limiter.consume(rule, 'a', 0).allowed).toBe(true);
    expect(limiter.consume(rule, 'b', 0).allowed).toBe(true);
    expect(limiter.consume(rule, 'a', 0).allowed).toBe(false);
  });

  it('evicts ended windows instead of growing without bound', () => {
    const limiter = new RateLimiter();
    const rule = { limit: 1, windowMs: 1000 };

    for (let i = 0; i < 100; i += 1) limiter.consume(rule, `k${i}`, 0);

    // After the window ends, the first key is treated as unseen again.
    expect(limiter.consume(rule, 'k0', 2000).allowed).toBe(true);
    expect(limiter.consume(rule, 'k0', 2000).allowed).toBe(false);
  });

  it('is a no-op when disabled', () => {
    const limiter = new RateLimiter({ disabled: true });
    const rule = { limit: 1, windowMs: 1000 };

    for (let i = 0; i < 50; i += 1) {
      expect(limiter.consume(rule, 'k', 0).allowed).toBe(true);
    }
  });

  it('forgets everything on reset', () => {
    const limiter = new RateLimiter();
    const rule = { limit: 1, windowMs: 1000 };

    limiter.consume(rule, 'k', 0);
    limiter.reset();

    expect(limiter.consume(rule, 'k', 0).allowed).toBe(true);
  });
});

describe('rateLimitKey', () => {
  it('namespaces so the login and signup IP windows do not collide', () => {
    expect(rateLimitKey('login:ip', '1.2.3.4')).not.toBe(rateLimitKey('signup:ip', '1.2.3.4'));
  });

  it('lower-cases, so an email key matches regardless of the casing sent', () => {
    expect(rateLimitKey('login:email', 'A@X.com')).toBe(rateLimitKey('login:email', 'a@x.com'));
  });
});

describe('the CL-E11 constants', () => {
  it('are login 10/15min per IP, 5/15min per email, signup 5/hour per IP', () => {
    expect(LOGIN_IP_RULE).toEqual({ limit: 10, windowMs: 15 * 60_000 });
    expect(LOGIN_EMAIL_RULE).toEqual({ limit: 5, windowMs: 15 * 60_000 });
    expect(SIGNUP_IP_RULE).toEqual({ limit: 5, windowMs: 60 * 60_000 });
  });
});
