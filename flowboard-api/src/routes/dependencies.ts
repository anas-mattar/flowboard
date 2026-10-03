import type { RateLimiter } from '../auth/rate-limit.js';
import type { Env } from '../config/env.js';
import type { Database } from '../db/client.js';

/**
 * What a route plugin needs from the application. Passed explicitly rather
 * than reached for through `app.decorate`, so a route's dependencies are
 * visible in its signature and an integration test can substitute them.
 */
export interface RouteDependencies {
  readonly db: Database;
  readonly env: Env;
  readonly rateLimiter: RateLimiter;
}
