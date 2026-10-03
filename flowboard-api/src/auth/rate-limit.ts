import type { RateLimitRule } from '../config/rate-limits.js';

/**
 * Fixed-window in-memory rate limiter (CL-E11, which allows
 * "`@fastify/rate-limit` or equivalent").
 *
 * Written here rather than taken as a dependency because the login limit is
 * two rules at once — per IP *and* per email — which `@fastify/rate-limit`
 * expresses as two plugin registrations with hand-written key generators and
 * two separate 429 shapes. One module is less code, adds no dependency, and
 * makes `Retry-After` consistent across all three rules.
 *
 * In-memory is correct for MVP: ADR-001 runs a single API instance. Several
 * instances means moving this state to Redis, not changing the rules.
 */

interface Window {
  /** Requests counted in the current window. */
  count: number;
  /** Epoch milliseconds at which the window ends. */
  resetAt: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Whole seconds until the window resets. At least 1 when blocked. */
  readonly retryAfterSeconds: number;
}

const ALLOWED: RateLimitDecision = { allowed: true, retryAfterSeconds: 0 };

export class RateLimiter {
  readonly #windows = new Map<string, Window>();

  /** No-op mode for tests and local tooling (`RATE_LIMIT_DISABLED=true`). */
  readonly #disabled: boolean;

  constructor(options: { disabled?: boolean } = {}) {
    this.#disabled = options.disabled ?? false;
  }

  /**
   * Counts one request against `key` under `rule` and says whether it may
   * proceed. Counting happens on every call, including blocked ones, so a
   * client that keeps hammering does not shorten its own penalty — the window
   * end is fixed when the window opens.
   */
  consume(rule: RateLimitRule, key: string, now: number = Date.now()): RateLimitDecision {
    if (this.#disabled) return ALLOWED;

    this.#evictExpired(now);

    const existing = this.#windows.get(key);

    if (existing === undefined || existing.resetAt <= now) {
      this.#windows.set(key, { count: 1, resetAt: now + rule.windowMs });
      return ALLOWED;
    }

    existing.count += 1;

    if (existing.count <= rule.limit) return ALLOWED;

    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  /** Forgets every window. Used between test files. */
  reset(): void {
    this.#windows.clear();
  }

  /**
   * Drops windows that have already ended, so a long-running process does not
   * accumulate one entry per IP seen since boot. Cheap because the map only
   * ever holds keys seen inside the longest window (one hour).
   */
  #evictExpired(now: number): void {
    for (const [key, window] of this.#windows) {
      if (window.resetAt <= now) this.#windows.delete(key);
    }
  }
}

/** Namespaced key so the login-per-IP and signup-per-IP windows never collide. */
export function rateLimitKey(scope: string, value: string): string {
  return `${scope}:${value.toLowerCase()}`;
}
