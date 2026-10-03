import { describe, expect, it } from 'vitest';
import { messages } from './messages';
import { resolveValidationMessage } from './validation';

describe('resolveValidationMessage', () => {
  it('maps every key the shared schemas emit', () => {
    expect(resolveValidationMessage('validation.required')).toBe(messages.validation.required);
    expect(resolveValidationMessage('validation.email')).toBe(messages.validation.email);
    expect(resolveValidationMessage('validation.passwordLength')).toBe(
      messages.validation.passwordLength,
    );
    expect(resolveValidationMessage('validation.tooLong')).toBe(messages.validation.tooLong);
  });

  it('returns an unrecognised key as-is rather than hiding the mismatch', () => {
    expect(resolveValidationMessage('validation.unknownKey')).toBe('validation.unknownKey');
  });
});
