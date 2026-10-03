import { vi } from 'vitest';

export function jsonResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

/** Stubs `global.fetch` to return each response in order, then rejects. */
export function mockFetchSequence(...responses: Response[]): void {
  const impl = vi.fn();
  for (const response of responses) {
    impl.mockImplementationOnce(() => Promise.resolve(response));
  }
  impl.mockImplementation(() =>
    Promise.reject(new Error('mockFetchSequence: no more responses queued')),
  );
  vi.stubGlobal('fetch', impl);
}
