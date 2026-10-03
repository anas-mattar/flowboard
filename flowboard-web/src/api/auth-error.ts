import { messages } from '../i18n/messages';
import { ApiClientError } from './client';

/**
 * Maps a signup or login failure to the one message the form shows
 * (FB-02 spec §5). Login's `401` is deliberately the same wording whether
 * the email is unknown or the password is wrong (CL-E10); this function
 * does not distinguish them either.
 */
export function describeAuthError(error: unknown): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'email_taken':
        return messages.auth.error.emailTaken;
      case 'invalid_credentials':
        return messages.auth.error.invalidCredentials;
      case 'rate_limited': {
        const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 60) / 60));
        return messages.auth.error.rateLimited(minutes);
      }
      default:
        return messages.auth.error.network;
    }
  }
  return messages.auth.error.network;
}
