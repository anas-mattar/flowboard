import { describe, expect, it } from 'vitest';

// Scratch test proving CI turns red (FB-00 spec section 4 item 6). Reverted after the run.
describe('FB-00 CI red demonstration', () => {
  it('fails on purpose', () => {
    expect(1).toBe(2);
  });
});
