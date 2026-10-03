import { API_ERROR_CODES } from '@flowboard/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Database } from '../db/client.js';
import type { UserRow } from '../db/schema/index.js';
import { sessionCookieSecure, type Env } from '../config/env.js';
import { authenticateSessionToken } from '../repositories/session.js';
import { clearSessionCookieOptions, SESSION_COOKIE_NAME } from './cookie.js';

/**
 * Authentication for every protected route (CL-E9, FB-02 §4 items 6, 7, 8).
 *
 * `requireAuth` resolves the caller from the bearer token first and the
 * `fb_session` cookie second, then — for a cookie-authenticated mutation —
 * checks the `Origin` header against `WEB_ORIGIN`. Both failures return the
 * `ApiError` envelope; neither ever says which of the two paths was tried.
 */

/** How the caller proved who they are. The `Origin` rule depends on it. */
export type AuthSource = 'cookie' | 'bearer';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireAuth`. Absent on unauthenticated routes. */
    user?: UserRow;
    /** The session backing `user`, so logout can delete exactly this row. */
    session?: { id: string; source: AuthSource };
  }

  interface FastifyInstance {
    /** `preHandler` for any route that needs a signed-in caller. */
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/** Mutating methods, for which a cookie-authenticated request needs a good `Origin`. */
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** Reads `Authorization: Bearer <token>`, case-insensitively on the scheme. */
export function bearerToken(header: string | undefined): string | null {
  if (header === undefined) return null;

  const match = /^Bearer[ ]+(?<token>[A-Za-z0-9._~+/=-]+)$/i.exec(header.trim());

  return match?.groups?.['token'] ?? null;
}

/**
 * Whether a cookie-authenticated `request` may mutate (FB-02 §4 item 7).
 *
 * An absent `Origin` is allowed: non-browser clients that still hold a cookie
 * (curl, a server-side render) do not send one, and `SameSite=Lax` already
 * stops the cross-site form post that would. A *present* `Origin` that is not
 * `WEB_ORIGIN` is a cross-site request and is refused.
 */
export function originAllowed(
  method: string,
  origin: string | undefined,
  source: AuthSource,
  webOrigin: string,
): boolean {
  if (source === 'bearer') return true;
  if (!MUTATING_METHODS.has(method.toUpperCase())) return true;
  if (origin === undefined) return true;

  // A literal `null` origin (sandboxed iframe, `data:` document) is a
  // *present* origin that is not ours, so it falls through and is refused.
  return origin === webOrigin;
}

export interface AuthPluginOptions {
  readonly env: Env;
  readonly db: Database;
}

async function authPlugin(app: FastifyInstance, options: AuthPluginOptions): Promise<void> {
  const { env, db } = options;
  const secure = sessionCookieSecure(env);

  app.decorateRequest('user', undefined);
  app.decorateRequest('session', undefined);

  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    const bearer = bearerToken(request.headers.authorization);
    const cookie = request.cookies[SESSION_COOKIE_NAME];
    const token = bearer ?? cookie;
    const source: AuthSource = bearer !== null ? 'bearer' : 'cookie';

    if (token === undefined || token.length === 0) {
      return reply.code(401).send({
        error: { code: API_ERROR_CODES.unauthenticated, message: 'Authentication required' },
      });
    }

    const authenticated = await authenticateSessionToken(db, token);

    if (authenticated === null) {
      // The session is gone or expired. Clear a stale cookie so the browser
      // stops sending it, but say nothing about which path failed.
      if (source === 'cookie') {
        void reply.clearCookie(SESSION_COOKIE_NAME, clearSessionCookieOptions(secure));
      }

      return reply.code(401).send({
        error: { code: API_ERROR_CODES.unauthenticated, message: 'Authentication required' },
      });
    }

    const origin = request.headers.origin;

    if (!originAllowed(request.method, origin, source, env.WEB_ORIGIN)) {
      request.log.warn(
        { method: request.method, route: request.routeOptions.url },
        'rejected a cookie-authenticated mutation with a foreign Origin',
      );

      return reply.code(403).send({
        error: { code: API_ERROR_CODES.badOrigin, message: 'Origin not allowed' },
      });
    }

    request.user = authenticated.user;
    request.session = { id: authenticated.sessionId, source };
  });
}

export const auth = fp(authPlugin, { name: 'flowboard-auth' });
