import { describe, expect, it } from 'vitest';
import { mePatchSchema, meResponseSchema } from './me.js';

const user = {
  id: '0199bb3b-0000-7000-8000-000000000001',
  displayName: 'Ada Lovelace',
  initials: 'AL',
  avatarColor: '#3d6df0',
  email: 'a@example.test',
  theme: 'dark',
  createdAt: '2026-10-03T00:00:00.000Z',
};

const workspace = {
  id: '0199bb3b-0000-7000-8000-000000000002',
  name: "Ada Lovelace's workspace",
  plan: 'free',
  createdAt: '2026-10-03T00:00:00.000Z',
};

describe('mePatchSchema', () => {
  it.each(['light', 'dark', 'system'])('accepts theme %s', (theme) => {
    expect(mePatchSchema.parse({ theme })).toEqual({ theme });
  });

  it('rejects an unknown theme', () => {
    expect(mePatchSchema.safeParse({ theme: 'sepia' }).success).toBe(false);
  });

  it.each([
    ['displayName', { theme: 'dark', displayName: 'Someone Else' }],
    ['email', { theme: 'dark', email: 'other@example.test' }],
    ['id', { theme: 'dark', id: '0199bb3b-0000-7000-8000-000000000009' }],
    ['nothing at all', {}],
  ])('rejects a body carrying %s (FB-02 §4 item 11)', (_label, body) => {
    expect(mePatchSchema.safeParse(body).success).toBe(false);
  });
});

describe('meResponseSchema', () => {
  it('accepts the caller, their memberships and the current workspace', () => {
    const parsed = meResponseSchema.parse({
      user,
      workspaces: [{ workspace, role: 'admin' }],
      currentWorkspace: workspace,
    });

    expect(parsed.workspaces[0]?.role).toBe('admin');
    expect(parsed.currentWorkspace.id).toBe(workspace.id);
  });

  it('rejects an unknown workspace role', () => {
    expect(
      meResponseSchema.safeParse({
        user,
        workspaces: [{ workspace, role: 'owner' }],
        currentWorkspace: workspace,
      }).success,
    ).toBe(false);
  });
});
