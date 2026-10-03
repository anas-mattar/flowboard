import { describe, expect, it } from 'vitest';
import { apiErrorSchema } from './error.js';

describe('apiErrorSchema', () => {
  it('accepts an envelope without details', () => {
    const result = apiErrorSchema.safeParse({
      error: { code: 'not_found', message: 'Board not found' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts an envelope carrying Zod issue details', () => {
    const result = apiErrorSchema.safeParse({
      error: {
        code: 'validation_failed',
        message: 'Request body is invalid',
        details: [{ path: ['title'], message: 'Required' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an envelope without a code', () => {
    const result = apiErrorSchema.safeParse({ error: { message: 'Boom' } });
    expect(result.success).toBe(false);
  });
});
