import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import type { DatabaseHandle } from '../src/db/client.js';
import {
  buildTestApp,
  sessionCookieValue,
  signupBody,
  withBearer,
  withSessionCookie,
} from './helpers/app.js';
import { openTestDatabase, resetDatabase } from './helpers/database.js';

/**
 * Every `/v1` route × authenticated and unauthenticated (FB-02 §8, AC 16).
 *
 * STANDARDS §1.4 requires a route that is not in this matrix to fail CI, so
 * the table below is generated from the application's own route list: adding
 * a `/v1` route without a row here makes `every route is covered` fail.
 *
 * This file asserts only the authentication axis — "does this route need a
 * session at all". The per-role authorisation of the board routes is
 * `boards.matrix.test.ts`, generated from FB-04 §8.
 */

let handle: DatabaseHandle;
let app: FastifyInstance;
let cookie: string;
let token: string;
/** A board owned by the matrix account, for the `{id}` routes. */
let boardId: string;

const account = {
  email: 'matrix@example.test',
  password: 'a-long-enough-password',
  displayName: 'Matrix User',
};

interface RouteCase {
  readonly method: 'GET' | 'POST' | 'PATCH';
  readonly url: string;
  /** Status for a caller with a valid session. */
  readonly authenticated: number;
  /** Status for a caller with no credentials. */
  readonly anonymous: number;
  readonly payload?: Record<string, unknown>;
  /** Routes that are meant to be reachable signed out (signup, login, health). */
  readonly public?: boolean;
}

const ROUTES: readonly RouteCase[] = [
  { method: 'GET', url: '/v1/health', authenticated: 200, anonymous: 200, public: true },
  {
    method: 'POST',
    url: '/v1/auth/signup',
    authenticated: 201,
    anonymous: 201,
    payload: {},
    public: true,
  },
  {
    method: 'POST',
    url: '/v1/auth/login',
    authenticated: 200,
    anonymous: 200,
    payload: { email: account.email, password: account.password },
    public: true,
  },
  { method: 'POST', url: '/v1/auth/logout', authenticated: 204, anonymous: 401 },
  { method: 'GET', url: '/v1/me', authenticated: 200, anonymous: 401 },
  {
    method: 'PATCH',
    url: '/v1/me',
    authenticated: 200,
    anonymous: 401,
    payload: { theme: 'dark' },
  },
  // FB-04. `{id}` is substituted with the matrix account's own board, so the
  // authenticated expectation is the success status rather than a 404.
  { method: 'GET', url: '/v1/boards', authenticated: 200, anonymous: 401 },
  {
    method: 'POST',
    url: '/v1/boards',
    authenticated: 201,
    anonymous: 401,
    payload: { name: 'Matrix board' },
  },
  { method: 'GET', url: '/v1/boards/{id}', authenticated: 200, anonymous: 401 },
  {
    method: 'PATCH',
    url: '/v1/boards/{id}',
    authenticated: 200,
    anonymous: 401,
    payload: { name: 'Matrix renamed' },
  },
];

beforeAll(async () => {
  handle = await openTestDatabase();
  ({ app } = await buildTestApp(handle));
});

afterAll(async () => {
  await app.close();
  await handle.close();
});

beforeEach(async () => {
  await resetDatabase(handle);

  const signup = await app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: signupBody(account),
  });
  cookie = sessionCookieValue(signup.headers) ?? '';

  const login = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email: account.email, password: account.password, tokenResponse: true },
  });
  token = login.json<{ sessionToken: string }>().sessionToken;

  const board = await app.inject({
    method: 'POST',
    url: '/v1/boards',
    payload: { name: 'Matrix fixture board' },
    ...withSessionCookie(cookie),
  });
  boardId = board.json<{ board: { id: string } }>().board.id;
});

function request(route: RouteCase, auth: Pick<InjectOptions, 'cookies' | 'headers'> = {}) {
  const payload = route.url === '/v1/auth/signup' ? signupBody() : (route.payload ?? undefined);

  return app.inject({
    method: route.method,
    // The table carries the OpenAPI path so the completeness check can compare
    // it directly; the request needs a real id.
    url: route.url.replace('{id}', boardId),
    ...(payload === undefined ? {} : { payload }),
    ...auth,
  });
}

describe('FB-02 authorisation matrix', () => {
  it.each(ROUTES.map((route) => [`${route.method} ${route.url}`, route] as const))(
    '%s — a cookie session gets the expected status',
    async (_name, route) => {
      const response = await request(route, withSessionCookie(cookie));

      expect(response.statusCode).toBe(route.authenticated);
    },
  );

  it.each(ROUTES.map((route) => [`${route.method} ${route.url}`, route] as const))(
    '%s — a bearer session gets the same status as a cookie session',
    async (_name, route) => {
      const response = await request(route, withBearer(token));

      expect(response.statusCode).toBe(route.authenticated);
    },
  );

  it.each(ROUTES.map((route) => [`${route.method} ${route.url}`, route] as const))(
    '%s — an anonymous caller gets the expected status',
    async (_name, route) => {
      const response = await request(route);

      expect(response.statusCode).toBe(route.anonymous);
    },
  );

  it.each(
    ROUTES.filter((route) => route.public !== true).map(
      (route) => [`${route.method} ${route.url}`, route] as const,
    ),
  )('%s — an invalid token is refused on both paths', async (_name, route) => {
    const bogus = 'this-token-was-never-issued-by-us-at-all';

    const viaCookie = await request(route, withSessionCookie(bogus));
    const viaBearer = await request(route, withBearer(bogus));

    expect(viaCookie.statusCode).toBe(401);
    expect(viaBearer.statusCode).toBe(401);
  });
});

describe('matrix completeness (STANDARDS §1.4)', () => {
  it('covers every /v1 route the application exposes', () => {
    const exposed = new Set<string>();

    // The OpenAPI document is generated from the registered routes and lists
    // paths and methods flatly, so it is the route inventory.
    const document = app.swagger() as { paths?: Record<string, Record<string, unknown>> };

    for (const [path, methods] of Object.entries(document.paths ?? {})) {
      for (const method of Object.keys(methods)) {
        exposed.add(`${method.toUpperCase()} ${path}`);
      }
    }

    const covered = new Set(ROUTES.map((route) => `${route.method} ${route.url}`));

    expect([...exposed].sort()).toEqual([...covered].sort());
  });
});
