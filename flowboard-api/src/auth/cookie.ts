import type { CookieSerializeOptions } from '@fastify/cookie';
import { SESSION_TTL_MS } from './session-token.js';

/**
 * The `fb_session` cookie (CL-E9, FB-02 §4 item 5).
 *
 * `HttpOnly` keeps the token out of reach of any script, `SameSite=Lax`
 * stops a cross-site form post from riding the session while still allowing
 * a top-level navigation back into the app, and `Path=/` makes it available
 * to every route. `Secure` is decided by the caller from the environment,
 * because local development serves the web app over plain http.
 */
export const SESSION_COOKIE_NAME = 'fb_session';

export function sessionCookieOptions(secure: boolean): CookieSerializeOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

/** The attributes used to clear the cookie on logout; must match except `maxAge`. */
export function clearSessionCookieOptions(secure: boolean): CookieSerializeOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
  };
}
