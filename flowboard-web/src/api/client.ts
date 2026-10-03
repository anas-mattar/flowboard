import { apiErrorSchema, type ApiErrorCode } from '@flowboard/shared';

/**
 * Thrown for every non-2xx response and for network failures. `code` is one
 * of the shared `ApiErrorCode`s, or `network_error` when `fetch` itself
 * rejected (offline, DNS, CORS). Callers branch on `code`, not on `message`
 * or `status`, so the UI never hardcodes an HTTP status.
 */
export class ApiClientError extends Error {
  readonly code: ApiErrorCode | 'network_error';
  readonly status: number | undefined;
  readonly details: unknown;
  readonly retryAfterSeconds: number | undefined;

  constructor(params: {
    code: ApiErrorCode | 'network_error';
    message: string;
    status?: number | undefined;
    details?: unknown;
    retryAfterSeconds?: number | undefined;
  }) {
    super(params.message);
    this.name = 'ApiClientError';
    this.code = params.code;
    this.status = params.status;
    this.details = params.details;
    this.retryAfterSeconds = params.retryAfterSeconds;
  }
}

const rawApiBaseUrl: unknown = import.meta.env['VITE_API_BASE_URL'];
const API_BASE_URL: string = typeof rawApiBaseUrl === 'string' ? rawApiBaseUrl : '';

function parseRetryAfter(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (header === null) {
    return undefined;
  }
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : undefined;
}

/**
 * JSON request helper, credentials always included so the `fb_session`
 * cookie (CL-E9) travels on every call. Never sets `tokenResponse` — the
 * web app relies solely on the cookie, never the bearer path.
 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...init.headers,
      },
    });
  } catch {
    throw new ApiClientError({ code: 'network_error', message: 'Could not reach the server.' });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      throw new ApiClientError({
        code: parsed.data.error.code as ApiErrorCode,
        message: parsed.data.error.message,
        status: response.status,
        details: parsed.data.error.details,
        retryAfterSeconds: parseRetryAfter(response),
      });
    }
    throw new ApiClientError({
      code: 'internal_error',
      message: `Request to ${path} failed with status ${String(response.status)}`,
      status: response.status,
    });
  }

  return body as T;
}
