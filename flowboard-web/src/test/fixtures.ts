import type { AuthResponse, MeResponse, User, Workspace } from '@flowboard/shared';

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '018f0a3a-0000-7000-8000-000000000001',
    email: 'ada@example.com',
    displayName: 'Ada Lovelace',
    initials: 'AL',
    avatarColor: '#3d6df0',
    theme: 'system',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: '018f0a3a-0000-7000-8000-000000000002',
    name: "Ada Lovelace's workspace",
    plan: 'free',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeAuthResponse(overrides: Partial<AuthResponse> = {}): AuthResponse {
  return {
    user: makeUser(),
    workspace: makeWorkspace(),
    ...overrides,
  };
}

export function makeMeResponse(overrides: Partial<MeResponse> = {}): MeResponse {
  const workspace = makeWorkspace();
  return {
    user: makeUser(),
    workspaces: [{ workspace, role: 'admin' }],
    currentWorkspace: workspace,
    ...overrides,
  };
}
