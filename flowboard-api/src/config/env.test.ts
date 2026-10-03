import { describe, expect, it } from 'vitest';
import { corsOrigins, EnvironmentError, loadEnv } from './env.js';

const validEnv = {
  DATABASE_URL: 'postgres://flowboard:flowboard@localhost:5432/flowboard',
} satisfies NodeJS.ProcessEnv;

describe('loadEnv', () => {
  it('applies defaults when only the required variables are set', () => {
    const env = loadEnv({ ...validEnv });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.HOST).toBe('127.0.0.1');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('coerces PORT to a number', () => {
    const env = loadEnv({ ...validEnv, PORT: '8080' });
    expect(env.PORT).toBe(8080);
  });

  it('names the missing variable when DATABASE_URL is unset', () => {
    expect(() => loadEnv({})).toThrowError(EnvironmentError);
    expect(() => loadEnv({})).toThrowError(/DATABASE_URL/);
  });

  it('rejects an out-of-range PORT and names it', () => {
    expect(() => loadEnv({ ...validEnv, PORT: '70000' })).toThrowError(/PORT/);
  });

  it('rejects an unknown LOG_LEVEL and names it', () => {
    expect(() => loadEnv({ ...validEnv, LOG_LEVEL: 'chatty' })).toThrowError(/LOG_LEVEL/);
  });

  it('does not put the offending value in the error message', () => {
    try {
      loadEnv({ ...validEnv, LOG_LEVEL: 'super-secret-looking-value' });
      expect.unreachable('loadEnv should have thrown');
    } catch (error) {
      expect((error as Error).message).not.toContain('super-secret-looking-value');
    }
  });
});

describe('corsOrigins', () => {
  it('splits and trims a comma-separated list', () => {
    const env = loadEnv({
      ...validEnv,
      CORS_ORIGIN: 'http://localhost:5173, https://app.example.test ,',
    });

    expect(corsOrigins(env)).toEqual(['http://localhost:5173', 'https://app.example.test']);
  });
});
