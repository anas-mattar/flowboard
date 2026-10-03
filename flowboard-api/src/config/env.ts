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
