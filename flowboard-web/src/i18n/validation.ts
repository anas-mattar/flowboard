import { messages } from './messages';

/**
 * The shared Zod field schemas (`flowboard-shared/src/schemas/auth.ts`) use
 * i18n keys as their Zod issue messages (`'validation.required'`, and so
 * on) specifically so the web app can display the same wording the API
 * would use for the same input. This maps one of those keys to the
 * catalogue string; an unrecognised key is returned as-is so a mismatch is
 * visible rather than silently swallowed.
 */
const VALIDATION_MESSAGES_BY_KEY: Readonly<Record<string, string>> = {
  'validation.email': messages.validation.email,
  'validation.passwordLength': messages.validation.passwordLength,
  'validation.required': messages.validation.required,
  'validation.tooLong': messages.validation.tooLong,
};

export function resolveValidationMessage(issueMessage: string): string {
  return VALIDATION_MESSAGES_BY_KEY[issueMessage] ?? issueMessage;
}
