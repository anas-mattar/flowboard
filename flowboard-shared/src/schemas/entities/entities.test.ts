import { describe, expect, it } from 'vitest';
import { BOARD_COLORS, DEFAULT_LABELS, DEFAULT_LISTS, POSITION_STEP } from '../../constants.js';
import { ACTIVITY_EVENT_TYPES, FUNNEL_EVENT_TYPES } from '../events.js';
import { activityEventSchema } from './activity-event.js';
import { boardMemberSchema, boardSchema } from './board.js';
import { cardSchema } from './card.js';
import { checklistItemSchema } from './checklist-item.js';
import { commentSchema } from './comment.js';
import { labelSchema } from './label.js';
import { listSchema } from './list.js';
import { publicUserSchema, userSchema } from './user.js';
import { workspaceSchema } from './workspace.js';

/**
 * Round-trips rows shaped like the seed (FB-01 §10) through every entity
 * schema, and asserts the negative cases FB-01 §4 and FS §8 care about.
 */

const USER_ID = '0199a0f2-0000-7000-8000-000000000001';
const WORKSPACE_ID = '0199a0f2-0000-7000-8000-000000000002';
const BOARD_ID = '0199a0f2-0000-7000-8000-000000000003';
const LIST_ID = '0199a0f2-0000-7000-8000-000000000004';
const CARD_ID = '0199a0f2-0000-7000-8000-000000000005';
const NOW = '2026-10-03T13:16:02.533Z';

const publicUser = {
  id: USER_ID,
  displayName: 'Anas Matar',
  initials: 'AM',
  avatarColor: '#3d6df0',
};

describe('PublicUser and User (FB-01 §6, FS §8)', () => {
  it('accepts a seed user', () => {
    expect(publicUserSchema.parse(publicUser)).toStrictEqual(publicUser);
  });

  it('strips email and any hash from PublicUser', () => {
    const parsed = publicUserSchema.parse({
      ...publicUser,
      email: 'anas@example.test',
      passwordHash: 'should-never-survive',
    });

    expect(parsed).toStrictEqual(publicUser);
    expect(parsed).not.toHaveProperty('email');
    expect(parsed).not.toHaveProperty('passwordHash');
  });

  it('accepts the full User shape', () => {
    const user = { ...publicUser, email: 'anas@example.test', theme: 'system', createdAt: NOW };
    expect(userSchema.parse(user)).toStrictEqual(user);
  });

  it('rejects an unknown theme', () => {
    expect(
      userSchema.safeParse({ ...publicUser, email: 'a@b.test', theme: 'neon', createdAt: NOW })
        .success,
    ).toBe(false);
  });
});

describe('Workspace (FB-01 §6, CL-D5)', () => {
  it('round-trips', () => {
    const workspace = { id: WORKSPACE_ID, name: 'Acme Workspace', plan: 'free', createdAt: NOW };
    expect(workspaceSchema.parse(workspace)).toStrictEqual(workspace);
  });

  it('rejects an unknown plan', () => {
    expect(
      workspaceSchema.safeParse({
        id: WORKSPACE_ID,
        name: 'Acme Workspace',
        plan: 'platinum',
        createdAt: NOW,
      }).success,
    ).toBe(false);
  });
});

describe('Board and BoardMember (FB-01 §6, FS §6)', () => {
  const board = {
    id: BOARD_ID,
    workspaceId: WORKSPACE_ID,
    name: 'Product Roadmap Q3',
    color: '#3d6df0',
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('round-trips a live board', () => {
    expect(boardSchema.parse(board)).toStrictEqual(board);
  });

  it('accepts an archived board (CL-A2)', () => {
    expect(boardSchema.parse({ ...board, archivedAt: NOW }).archivedAt).toBe(NOW);
  });

  it('has no boolean archived flag', () => {
    expect(Object.keys(boardSchema.shape)).not.toContain('archived');
  });

  it('rejects a non-hex colour', () => {
    expect(boardSchema.safeParse({ ...board, color: 'blue' }).success).toBe(false);
  });

  it('accepts every board role', () => {
    for (const role of ['admin', 'member', 'observer'] as const) {
      expect(boardMemberSchema.parse({ boardId: BOARD_ID, role, user: publicUser }).role).toBe(
        role,
      );
    }
  });

  it('rejects a role outside FS §6', () => {
    expect(
      boardMemberSchema.safeParse({ boardId: BOARD_ID, role: 'owner', user: publicUser }).success,
    ).toBe(false);
  });
});

describe('Label (CL-D3)', () => {
  it('round-trips every default label', () => {
    for (const [index, label] of DEFAULT_LABELS.entries()) {
      const row = {
        id: `0199a0f2-0000-7000-8000-00000000010${index}`,
        boardId: BOARD_ID,
        name: label.name,
        color: label.color,
      };
      expect(labelSchema.parse(row)).toStrictEqual(row);
    }
  });
});

describe('List (FS §5, L-04)', () => {
  const list = {
    id: LIST_ID,
    boardId: BOARD_ID,
    name: 'In Progress',
    position: POSITION_STEP,
    wipLimit: 3,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('round-trips a list with a WIP limit', () => {
    expect(listSchema.parse(list)).toStrictEqual(list);
  });

  it('accepts a null WIP limit', () => {
    expect(listSchema.parse({ ...list, wipLimit: null }).wipLimit).toBeNull();
  });

  it('rejects a zero or negative WIP limit', () => {
    expect(listSchema.safeParse({ ...list, wipLimit: 0 }).success).toBe(false);
    expect(listSchema.safeParse({ ...list, wipLimit: -1 }).success).toBe(false);
  });

  it('rejects a non-positive position', () => {
    expect(listSchema.safeParse({ ...list, position: 0 }).success).toBe(false);
  });
});

describe('Card (FS §5, ARCHITECTURE §2.3)', () => {
  const card = {
    id: CARD_ID,
    listId: LIST_ID,
    title: 'Drag & drop performance on large boards',
    position: 2048,
    dueAt: NOW,
    dueComplete: false,
    archivedAt: null,
    createdBy: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('round-trips', () => {
    expect(cardSchema.parse(card)).toStrictEqual(card);
  });

  it('does not carry the description (fetched with card detail)', () => {
    expect(Object.keys(cardSchema.shape)).not.toContain('description');
  });

  it('rejects a timestamp with an offset instead of UTC', () => {
    expect(cardSchema.safeParse({ ...card, dueAt: '2026-10-03T13:16:02+02:00' }).success).toBe(
      false,
    );
  });
});

describe('ChecklistItem and Comment (C-09, C-10)', () => {
  it('round-trips a checklist item', () => {
    const item = {
      id: '0199a0f2-0000-7000-8000-000000000006',
      cardId: CARD_ID,
      text: 'Profile with 1k cards',
      done: true,
      position: POSITION_STEP,
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(checklistItemSchema.parse(item)).toStrictEqual(item);
  });

  it('round-trips a comment with its author profile', () => {
    const comment = {
      id: '0199a0f2-0000-7000-8000-000000000007',
      cardId: CARD_ID,
      author: publicUser,
      body: 'Repro confirmed at ~600 cards on Chrome.',
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(commentSchema.parse(comment)).toStrictEqual(comment);
  });
});

describe('ActivityEvent (FS §5.2)', () => {
  it('accepts every one of the 15 FS §5.2 types', () => {
    expect(ACTIVITY_EVENT_TYPES).toHaveLength(15);

    for (const type of ACTIVITY_EVENT_TYPES) {
      const event = {
        id: '0199a0f2-0000-7000-8000-000000000008',
        cardId: CARD_ID,
        actor: publicUser,
        type,
        payload: {},
        createdAt: NOW,
      };
      expect(activityEventSchema.parse(event).type).toBe(type);
    }
  });

  it('rejects a type outside the enum', () => {
    expect(
      activityEventSchema.safeParse({
        id: '0199a0f2-0000-7000-8000-000000000008',
        cardId: CARD_ID,
        actor: publicUser,
        type: 'card.deleted',
        payload: {},
        createdAt: NOW,
      }).success,
    ).toBe(false);
  });

  it('has no updatedAt (CL-E19: append-only, never edited)', () => {
    expect(Object.keys(activityEventSchema.shape)).not.toContain('updatedAt');
  });
});

describe('constants (FB-01 §3)', () => {
  it('ships the six default labels with PT colours (CL-D3)', () => {
    expect(DEFAULT_LABELS).toHaveLength(6);
    expect(DEFAULT_LABELS.map((label) => label.name)).toStrictEqual([
      'Bug',
      'Feature',
      'Design',
      'Urgent',
      'Research',
      'Blocked',
    ]);
  });

  it('ships the three default lists (B-02)', () => {
    expect(DEFAULT_LISTS.map((list) => list.name)).toStrictEqual(['To Do', 'Doing', 'Done']);
    expect(DEFAULT_LISTS[1]?.wipLimit).toBe(3);
  });

  it('ships the prototype board colours', () => {
    expect(BOARD_COLORS).toHaveLength(5);
    expect(BOARD_COLORS[0]).toBe('#3d6df0');
  });

  it('ships the seven initial funnel event types (BM §9)', () => {
    expect(FUNNEL_EVENT_TYPES).toHaveLength(7);
    expect(FUNNEL_EVENT_TYPES).toContain('activation.reached');
  });
});
