import { describe, expect, it } from 'vitest';
import { ApiClientError } from './client';
import { describeAuthError } from './auth-error';
import { messages } from '../i18n/messages';

describe('describeAuthError', () => {
  it('maps email_taken', () => {
    expect(describeAuthError(new ApiClientError({ code: 'email_taken', message: 'x' }))).toBe(
      messages.auth.error.emailTaken,
    );
  });

  it('maps invalid_credentials', () => {
    expect(
      describeAuthError(new ApiClientError({ code: 'invalid_credentials', message: 'x' })),
    ).toBe(messages.auth.error.invalidCredentials);
  });

  it('maps rate_limited using retryAfterSeconds, rounded up to whole minutes', () => {
    expect(
      describeAuthError(
        new ApiClientError({ code: 'rate_limited', message: 'x', retryAfterSeconds: 61 }),
      ),
    ).toBe(messages.auth.error.rateLimited(2));
  });

  it('falls back to the network message for network_error', () => {
    expect(describeAuthError(new ApiClientError({ code: 'network_error', message: 'x' }))).toBe(
      messages.auth.error.network,
    );
  });

  it('falls back to the network message for a non-ApiClientError', () => {
    expect(describeAuthError(new Error('boom'))).toBe(messages.auth.error.network);
  });
});
