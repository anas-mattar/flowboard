import { DEFAULT_LABELS } from '@flowboard/shared';

/**
 * The prototype `state` object (FS §9, `docs/product/flowboard-prototype.html`)
 * expressed as seed data, field for field, so QA can compare a seeded board
 * with the prototype screen.
 *
 * Keys here (`u1`, `b1`, `s1`, `l1`) are the prototype's own identifiers. They
 * are lookup keys for the seed only; every row gets a real UUID v7 at insert.
 *
 * Due dates are relative to seed time (`dueInDays`), matching the prototype's
 * `day(n)` helper, so a freshly seeded database always has overdue, due-today
 * and upcoming cards for the due-date buckets (C-08).
 */

/** Password shared by every seeded user. Documented, non-secret, local only. */
export const SEED_PASSWORD = 'flowboard-dev';

/** Seeded users keep `@example.test`, a reserved domain that cannot receive mail. */
export const SEED_EMAIL_DOMAIN = 'example.test';

export interface SeedUser {
  readonly key: string;
  readonly email: string;
  readonly displayName: string;
  readonly initials: string;
  readonly avatarColor: string;
}

export const SEED_USERS: readonly SeedUser[] = [
  {
    key: 'u1',
    email: `anas@${SEED_EMAIL_DOMAIN}`,
    displayName: 'Anas Matar',
    initials: 'AM',
    avatarColor: '#3d6df0',
  },
  {
    key: 'u2',
    email: `lena@${SEED_EMAIL_DOMAIN}`,
    displayName: 'Lena Fischer',
    initials: 'LF',
    avatarColor: '#8f5bff',
  },
  {
    key: 'u3',
    email: `omar@${SEED_EMAIL_DOMAIN}`,
    displayName: 'Omar Haddad',
    initials: 'OH',
    avatarColor: '#22a06b',
  },
  {
    key: 'u4',
    email: `priya@${SEED_EMAIL_DOMAIN}`,
    displayName: 'Priya Nair',
    initials: 'PN',
    avatarColor: '#e2703a',
  },
  {
    key: 'u5',
    email: `tom@${SEED_EMAIL_DOMAIN}`,
    displayName: 'Tom Becker',
    initials: 'TB',
    avatarColor: '#c9372c',
  },
];

/** The workspace owner; the prototype's `ME`. */
export const SEED_OWNER_KEY = 'u1';

export const SEED_WORKSPACE_NAME = 'Acme Workspace';

/**
 * The six prototype labels, by key. The names and colours are exactly
 * `DEFAULT_LABELS` (CL-D3), so every seeded board gets the standard set and
 * the prototype's `l1`…`l6` keys map onto it.
 */
export const SEED_LABEL_KEYS = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'] as const;

export type SeedLabelKey = (typeof SEED_LABEL_KEYS)[number];

export const SEED_LABELS = SEED_LABEL_KEYS.map((key, index) => {
  const label = DEFAULT_LABELS[index];

  if (label === undefined) {
    throw new Error(`DEFAULT_LABELS has no entry ${index} for seed label ${key}`);
  }

  return { key, name: label.name, color: label.color };
});

export interface SeedChecklistItem {
  readonly text: string;
  readonly done: boolean;
}

export interface SeedComment {
  readonly authorKey: string;
  readonly body: string;
}

export interface SeedCard {
  readonly title: string;
  readonly description?: string;
  readonly labelKeys?: readonly SeedLabelKey[];
  readonly memberKeys?: readonly string[];
  /** Days from seed time; negative is overdue. Omitted means no due date. */
  readonly dueInDays?: number;
  readonly dueComplete?: boolean;
  readonly checklist?: readonly SeedChecklistItem[];
  readonly comments?: readonly SeedComment[];
}

export interface SeedList {
  readonly key: string;
  readonly name: string;
  /** `null` means no WIP limit; the prototype stores `0`. */
  readonly wipLimit: number | null;
  readonly cards: readonly SeedCard[];
}

export interface SeedBoard {
  readonly key: string;
  readonly name: string;
  readonly color: string;
  /** User keys that have starred this board (CL-E14). */
  readonly starredByKeys: readonly string[];
  readonly memberKeys: readonly string[];
  readonly lists: readonly SeedList[];
}

export const SEED_BOARDS: readonly SeedBoard[] = [
  {
    key: 'b1',
    name: 'Product Roadmap Q3',
    color: '#3d6df0',
    starredByKeys: ['u1'],
    memberKeys: ['u1', 'u2', 'u3', 'u4'],
    lists: [
      {
        key: 's1',
        name: 'Backlog',
        wipLimit: null,
        cards: [
          {
            title: 'Research competitor onboarding flows',
            description:
              'Compare Trello, Asana and Monday first-run experience. Capture screenshots.',
            labelKeys: ['l5'],
            memberKeys: ['u2'],
          },
          {
            title: 'Define SSO requirements for Enterprise',
            labelKeys: ['l2'],
            dueInDays: 12,
          },
          {
            title: 'Accessibility audit (WCAG 2.2 AA)',
            labelKeys: ['l3', 'l5'],
            memberKeys: ['u4'],
          },
        ],
      },
      {
        key: 's2',
        name: 'Design',
        wipLimit: 3,
        cards: [
          {
            title: 'Card detail redesign',
            description: 'Simplify the right rail; move destructive actions behind a menu.',
            labelKeys: ['l3'],
            memberKeys: ['u4'],
            dueInDays: 3,
            checklist: [
              { text: 'Wireframes', done: true },
              { text: 'Hi-fi mockups', done: true },
              { text: 'Dev handoff', done: false },
            ],
          },
          {
            title: 'Empty-state illustrations',
            labelKeys: ['l3'],
            memberKeys: ['u2'],
          },
        ],
      },
      {
        key: 's3',
        name: 'In Progress',
        wipLimit: 3,
        cards: [
          {
            title: 'Drag & drop performance on large boards',
            description:
              'Boards with 500+ cards drop frames while dragging. Virtualise the list body.',
            labelKeys: ['l1', 'l4'],
            memberKeys: ['u3'],
            dueInDays: 1,
            checklist: [
              { text: 'Profile with 1k cards', done: true },
              { text: 'Virtualise list', done: false },
            ],
            comments: [{ authorKey: 'u3', body: 'Repro confirmed at ~600 cards on Chrome.' }],
          },
          {
            title: 'Board member invitations',
            labelKeys: ['l2'],
            memberKeys: ['u1', 'u2'],
            dueInDays: 5,
          },
          {
            title: 'Label filter in the top bar',
            labelKeys: ['l2'],
            memberKeys: ['u4'],
          },
        ],
      },
      {
        key: 's4',
        name: 'Review',
        wipLimit: 2,
        cards: [
          {
            title: 'Keyboard shortcuts pass',
            labelKeys: ['l2'],
            memberKeys: ['u5'],
            dueInDays: -1,
          },
          {
            title: 'Activity feed pagination',
            labelKeys: ['l1'],
            memberKeys: ['u3'],
          },
        ],
      },
      {
        key: 's5',
        name: 'Done',
        wipLimit: null,
        cards: [
          {
            title: 'Workspace switcher',
            labelKeys: ['l2'],
            memberKeys: ['u1'],
            dueInDays: -6,
            dueComplete: true,
          },
          {
            title: 'List reordering',
            labelKeys: ['l2'],
            memberKeys: ['u3'],
            dueInDays: -9,
            dueComplete: true,
          },
        ],
      },
    ],
  },
  {
    key: 'b2',
    name: 'Marketing Launch',
    color: '#8f5bff',
    starredByKeys: [],
    memberKeys: ['u1', 'u4', 'u5'],
    lists: [
      {
        key: 'm1',
        name: 'Ideas',
        wipLimit: null,
        cards: [{ title: 'Launch webinar' }, { title: 'Customer story: Northwind' }],
      },
      {
        key: 'm2',
        name: 'In Progress',
        wipLimit: 2,
        cards: [
          {
            title: 'Pricing page copy',
            labelKeys: ['l4'],
            memberKeys: ['u5'],
            dueInDays: 2,
          },
        ],
      },
      {
        key: 'm3',
        name: 'Published',
        wipLimit: null,
        cards: [
          {
            title: 'Blog: why WIP limits work',
            dueInDays: -3,
            dueComplete: true,
          },
        ],
      },
    ],
  },
  {
    key: 'b3',
    name: 'Customer Support',
    color: '#22a06b',
    starredByKeys: [],
    memberKeys: ['u1', 'u3'],
    lists: [
      {
        key: 't1',
        name: 'New',
        wipLimit: null,
        cards: [
          {
            title: 'Ticket #4821 — export fails',
            labelKeys: ['l1', 'l4'],
            dueInDays: 0,
          },
        ],
      },
      {
        key: 't2',
        name: 'Investigating',
        wipLimit: 3,
        cards: [
          {
            title: 'Ticket #4790 — slow board load',
            labelKeys: ['l1'],
            memberKeys: ['u3'],
          },
        ],
      },
      { key: 't3', name: 'Resolved', wipLimit: null, cards: [] },
    ],
  },
];

/** Totals the seed integration test asserts (FB-01 §4 item 8). */
export const SEED_COUNTS = {
  users: SEED_USERS.length,
  workspaces: 1,
  boards: SEED_BOARDS.length,
  lists: SEED_BOARDS.reduce((total, board) => total + board.lists.length, 0),
  cards: SEED_BOARDS.reduce(
    (total, board) =>
      total + board.lists.reduce((listTotal, list) => listTotal + list.cards.length, 0),
    0,
  ),
  labels: SEED_BOARDS.length * SEED_LABELS.length,
} as const;
