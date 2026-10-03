import { Writable } from 'node:stream';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../../src/app.js';
import { RateLimiter } from '../../src/auth/rate-limit.js';
import { loadEnv, type Env } from '../../src/config/env.js';
import type { DatabaseHandle } from '../../src/db/client.js';
import { SESSION_COOKIE_NAME } from '../../src/auth/cookie.js';

/**
 * Builds the real application against the real test database for the FB-02
 * route tests. Nothing is mocked: STANDARDS §4 does not count a mocked
 * database as integration coverage.
 */

/** The origin the app treats as its web app, used by the `Origin` tests. */
export const TEST_WEB_ORIGIN = 'http://localhost:5173';

export interface TestAppOptions {
  /** Leave the rate limiter live. Off by default so fixtures are not throttled. */
  readonly rateLimit?: boolean;
  readonly env?: Partial<Record<string, string>>;
  /** Capture the structured log, for the AC 2 scrubbing assertion. */
  readonly loggerStream?: NodeJS.WritableStream;
}

export interface TestApp {
  readonly app: FastifyInstance;
  readonly env: Env;
  readonly rateLimiter: RateLimiter;
}

export async function buildTestApp(
  database: DatabaseHandle,
  options: TestAppOptions = {},
): Promise<TestApp> {
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGIN: TEST_WEB_ORIGIN,
    DATABASE_URL: process.env['DATABASE_URL_TEST'] ?? 'postgres://unused/unused',
    RATE_LIMIT_DISABLED: options.rateLimit === true ? 'false' : 'true',
    ...options.env,
  });

  const rateLimiter = new RateLimiter({ disabled: env.RATE_LIMIT_DISABLED });
  const app = await buildApp(env, {
    database,
    rateLimiter,
    ...(options.loggerStream === undefined ? {} : { loggerStream: options.loggerStream }),
  });

  return { app, env, rateLimiter };
}

/** A writable that keeps everything written to it, for the log assertions. */
export class CapturingStream extends Writable {
  readonly #chunks: string[] = [];

  override _write(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.#chunks.push(String(chunk));
    callback();
  }

  get text(): string {
    return this.#chunks.join('');
  }
}

/** A valid signup body with a unique email, so a file can sign up repeatedly. */
export function signupBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const unique = Math.random().toString(36).slice(2, 10);

  return {
    email: `user-${unique}@example.test`,
    password: 'a-long-enough-password',
    displayName: 'Ada Lovelace',
    ...overrides,
  };
}

/** Every `Set-Cookie` value on a reply, as a flat array. */
export function setCookieHeaders(headers: Record<string, unknown>): string[] {
  const raw: unknown = headers['set-cookie'];

  if (typeof raw === 'string') return [raw];

  // Fastify gives an array when more than one cookie is set on the reply.
  if (Array.isArray(raw)) return raw.filter((value): value is string => typeof value === 'string');

  return [];
}

/** The `fb_session` `Set-Cookie` value, or `undefined` if none was set. */
export function sessionCookieHeader(headers: Record<string, unknown>): string | undefined {
  return setCookieHeaders(headers).find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`));
}

/** The token inside the `fb_session` `Set-Cookie` value. */
export function sessionCookieValue(headers: Record<string, unknown>): string | undefined {
  const header = sessionCookieHeader(headers);

  if (header === undefined) return undefined;

  return header.slice(`${SESSION_COOKIE_NAME}=`.length).split(';')[0];
}

/** An `inject` options object carrying the session cookie. */
export function withSessionCookie(token: string): Pick<InjectOptions, 'cookies'> {
  return { cookies: { [SESSION_COOKIE_NAME]: token } };
}

/** An `inject` options object carrying the bearer token. */
export function withBearer(token: string): Pick<InjectOptions, 'headers'> {
  return { headers: { authorization: `Bearer ${token}` } };
}
