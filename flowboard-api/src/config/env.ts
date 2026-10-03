import { z } from 'zod';

/**
 * Typed environment loading (FB-00 §4 item 4, STANDARDS §1.5).
 * Every variable is declared here and in `.env.example`. A missing required
 * variable fails fast with the variable name in the message.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'must be a PostgreSQL connection string'),
  DATABASE_URL_TEST: z.string().min(1).optional(),

  // FB-02 §9. The single browser origin that may send a cookie-authenticated
  // mutation (CL-E9). Distinct from `CORS_ORIGIN`, which may list several.
  WEB_ORIGIN: z.string().min(1).default('http://localhost:5173'),

  // `Secure` on the session cookie. Defaults from `NODE_ENV` in
  // `sessionCookieSecure()` so local development over http still works.
  SESSION_COOKIE_SECURE: z.enum(['true', 'false']).optional(),

  // Tests only: turns the auth rate limiter into a no-op so the other
  // integration files are not throttled by their own fixtures (FB-02 §9).
  RATE_LIMIT_DISABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export class EnvironmentError extends Error {
  public override readonly name = 'EnvironmentError';

  constructor(message: string) {
    super(message);
  }
}

/** Origins allowed to call the API, parsed from the comma-separated `CORS_ORIGIN`. */
export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Whether the `fb_session` cookie carries `Secure` (FB-02 §4 item 5).
 * `SESSION_COOKIE_SECURE` overrides; otherwise it is on everywhere except
 * local development, where the web app is served over plain http.
 */
export function sessionCookieSecure(env: Env): boolean {
  if (env.SESSION_COOKIE_SECURE !== undefined) return env.SESSION_COOKIE_SECURE === 'true';

  return env.NODE_ENV !== 'development';
}

/**
 * Parses `source` (defaults to `process.env`) and throws an `EnvironmentError`
 * naming every offending variable. Never logs or echoes a value.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => {
        const variable = issue.path.join('.') || '(unknown)';
        const reason = issue.code === 'invalid_type' ? 'is required' : issue.message;
        return `${variable} ${reason}`;
      })
      .sort((a, b) => a.localeCompare(b))
      .join('; ');

    throw new EnvironmentError(
      `Invalid environment configuration: ${problems}. See .env.example for every variable.`,
    );
  }

  return result.data;
}
