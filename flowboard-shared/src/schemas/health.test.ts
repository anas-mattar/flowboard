import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('accepts a well-formed health response', () => {
    const parsed = healthResponseSchema.parse({ status: 'ok', version: '0.1.0' });
    expect(parsed).toEqual({ status: 'ok', version: '0.1.0' });
  });

  it('rejects a status other than "ok"', () => {
    const result = healthResponseSchema.safeParse({ status: 'degraded', version: '0.1.0' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing version', () => {
    const result = healthResponseSchema.safeParse({ status: 'ok' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty version', () => {
    const result = healthResponseSchema.safeParse({ status: 'ok', version: '' });
    expect(result.success).toBe(false);
  });
});
