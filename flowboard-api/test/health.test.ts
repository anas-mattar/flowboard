import { healthResponseSchema } from '@flowboard/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { API_PACKAGE_VERSION } from '../src/version.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(
    loadEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: process.env['DATABASE_URL_TEST'] ?? 'postgres://unused/unused',
    }),
  );
});

afterAll(async () => {
  await app.close();
});

describe('GET /v1/health', () => {
  it('returns 200 with a HealthResponse body', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/health' });

    expect(response.statusCode).toBe(200);

    const body: unknown = response.json();
    expect(healthResponseSchema.parse(body)).toEqual({
      status: 'ok',
      version: API_PACKAGE_VERSION,
    });
  });

  it('echoes a supplied request id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
      headers: { 'x-request-id': 'fb00-integration-request' },
    });

    expect(response.headers['x-request-id']).toBe('fb00-integration-request');
  });
});

describe('GET /v1/openapi.json', () => {
  it('returns an OpenAPI 3 document listing /health', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/openapi.json' });

    expect(response.statusCode).toBe(200);

    const document = response.json<{
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
    }>();

    expect(document.openapi.startsWith('3.')).toBe(true);
    expect(Object.keys(document.paths)).toContain('/v1/health');
    expect(document.paths['/v1/health']).toHaveProperty('get');
  });
});

describe('unknown routes', () => {
  it('returns 404 in the ApiError envelope', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/does-not-exist' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'not_found' } });
  });
});
