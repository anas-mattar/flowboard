import { BOARD_ROLES, WORKSPACE_ROLES } from '@flowboard/shared';
import { describe, expect, it } from 'vitest';
import { can, CAPABILITIES, type Capability } from './can.js';

/** FB-02 §10 unit row `authz/can.test.ts`; covers AC 16 and FB-02 §8. */

const alice = { userId: '0199bb3b-0000-7000-8000-000000000001' };

describe('self capabilities', () => {
  it.each(['self.read', 'self.updateTheme', 'self.logout'] as const)(
    'grants %s to any authenticated user with no resource context',
    (capability) => {
      expect(can(alice, capability)).toBe(true);
    },
  );

  it('denies everything to a principal with no user id', () => {
    for (const capability of CAPABILITIES) {
      expect(can({ userId: '' }, capability, { workspaceRole: 'admin' })).toBe(false);
    }
  });
});

describe('workspace capabilities (FS §6 last row, CL-A9)', () => {
  it('gives manage members and billing to the workspace admin only', () => {
    expect(can(alice, 'workspace.manageMembers', { workspaceRole: 'admin' })).toBe(true);
    expect(can(alice, 'workspace.manageBilling', { workspaceRole: 'admin' })).toBe(true);

    expect(can(alice, 'workspace.manageMembers', { workspaceRole: 'member' })).toBe(false);
    expect(can(alice, 'workspace.manageBilling', { workspaceRole: 'member' })).toBe(false);
  });

  it('gives read to any workspace member', () => {
    for (const role of WORKSPACE_ROLES) {
      expect(can(alice, 'workspace.read', { workspaceRole: role })).toBe(true);
    }
  });

  it('denies every workspace capability to a non-member', () => {
    expect(can(alice, 'workspace.read', {})).toBe(false);
    expect(can(alice, 'workspace.manageMembers', { boardRole: 'admin' })).toBe(false);
  });
});

describe('board capabilities (FS §6 columns 2 to 4)', () => {
  it('matches the FS §6 matrix row by row', () => {
    const matrix: Record<string, Record<string, boolean>> = {
      'board.view': { admin: true, member: true, observer: true },
      'board.comment': { admin: true, member: true, observer: true },
      'board.manageCards': { admin: true, member: true, observer: false },
      'board.manageLists': { admin: true, member: true, observer: false },
      'board.manageLabels': { admin: true, member: true, observer: false },
      'board.manageMembers': { admin: true, member: false, observer: false },
      'board.manage': { admin: true, member: false, observer: false },
    };

    for (const [capability, byRole] of Object.entries(matrix)) {
      for (const role of BOARD_ROLES) {
        expect(
          can(alice, capability as Capability, { boardRole: role }),
          `${capability} for board ${role}`,
        ).toBe(byRole[role]);
      }
    }
  });

  it('gives the workspace admin every board capability in their workspace (FS §6 column 1)', () => {
    for (const capability of CAPABILITIES.filter((c) => c.startsWith('board.'))) {
      expect(can(alice, capability, { workspaceRole: 'admin' })).toBe(true);
    }
  });

  it('does not give a plain workspace member access to an existing board', () => {
    // `board.create` is the exception: it is the one board capability that is
    // not carried by a board role, because there is no board yet when it is
    // checked. FS §6 gives it to every workspace member (FB-04 §8).
    for (const capability of CAPABILITIES.filter(
      (c) => c.startsWith('board.') && c !== 'board.create',
    )) {
      expect(can(alice, capability, { workspaceRole: 'member' })).toBe(false);
    }
  });

  it('lets any workspace member create a board, and nobody outside the workspace (FB-04 §8)', () => {
    expect(can(alice, 'board.create', { workspaceRole: 'member' })).toBe(true);
    expect(can(alice, 'board.create', { workspaceRole: 'admin' })).toBe(true);
    expect(can(alice, 'board.create', {})).toBe(false);
    // A board role in another workspace is not workspace membership here.
    expect(can(alice, 'board.create', { boardRole: 'admin' })).toBe(false);
  });

  it('denies every board capability with no roles at all', () => {
    for (const capability of CAPABILITIES.filter((c) => c.startsWith('board.'))) {
      expect(can(alice, capability, {})).toBe(false);
    }
  });
});

describe('matrix completeness', () => {
  it('has a rule for every declared capability', () => {
    // Fails closed: a capability added to `CAPABILITIES` without a rule is
    // denied for every role, which this detects as "granted to nobody".
    const grantedToSomeone = CAPABILITIES.filter((capability) =>
      [
        can(alice, capability),
        can(alice, capability, { workspaceRole: 'admin' }),
        can(alice, capability, { workspaceRole: 'member' }),
        ...BOARD_ROLES.map((role) => can(alice, capability, { boardRole: role })),
      ].some(Boolean),
    );

    expect(grantedToSomeone).toEqual([...CAPABILITIES]);
  });
});
