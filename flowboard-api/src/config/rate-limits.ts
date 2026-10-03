/**
 * Authentication rate limits (CL-E11, FB-02 §4 item 10).
 *
 * In-memory and therefore per-process, which is correct for MVP: ADR-001 runs
 * a single API instance. Moving to several instances means moving these
 * counters to Redis, not changing the numbers.
 */

export interface RateLimitRule {
  /** Requests allowed inside one window. */
  readonly limit: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Login: 10 attempts per 15 minutes per IP. */
export const LOGIN_IP_RULE: RateLimitRule = { limit: 10, windowMs: 15 * MINUTE };

/** Login: 5 attempts per 15 minutes per email, so one account cannot be ground down from many IPs. */
export const LOGIN_EMAIL_RULE: RateLimitRule = { limit: 5, windowMs: 15 * MINUTE };

/** Signup: 5 per hour per IP. */
export const SIGNUP_IP_RULE: RateLimitRule = { limit: 5, windowMs: HOUR };
