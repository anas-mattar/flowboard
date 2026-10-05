import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyResponse, jsonResponse, mockFetchSequence } from '../test/mock-fetch';
import { ApiClientError, request } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request', () => {
  it('sends credentials: include on every call', async () => {
    const impl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', impl);

    await request('/v1/me');

    expect(impl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('returns undefined for a 204 response', async () => {
    mockFetchSequence(emptyResponse(204));

    await expect(request('/v1/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('omits Content-Type for a bodyless request', async () => {
    const impl = vi.fn().mockResolvedValue(emptyResponse(204));
    vi.stubGlobal('fetch', impl);

    await request('/v1/auth/logout', { method: 'POST' });

    const [, init] = impl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('sets Content-Type when a body is present', async () => {
    const impl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', impl);

    await request('/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'a@b.com' }) });

    const [, init] = impl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('parses the response body on success', async () => {
    mockFetchSequence(jsonResponse(200, { hello: 'world' }));

    await expect(request('/v1/me')).resolves.toEqual({ hello: 'world' });
  });

  it('throws ApiClientError with the ApiError code and message on failure', async () => {
    mockFetchSequence(
      jsonResponse(409, {
        error: { code: 'email_taken', message: 'That email address is already registered' },
      }),
    );

    const error = await request('/v1/auth/signup').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      code: 'email_taken',
      message: 'That email address is already registered',
      status: 409,
    });
  });

  it('reads retryAfterSeconds from the Retry-After header', async () => {
    mockFetchSequence(
      jsonResponse(
        429,
        { error: { code: 'rate_limited', message: 'Too many attempts' } },
        { 'retry-after': '90' },
      ),
    );

    const error = await request('/v1/auth/login').catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'rate_limited', retryAfterSeconds: 90 });
  });

  it('throws a network_error ApiClientError when fetch itself rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = await request('/v1/me').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).code).toBe('network_error');
  });
});
