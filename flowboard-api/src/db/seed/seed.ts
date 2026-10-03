import { POSITION_STEP, positionAtEnd } from '@flowboard/shared';
import argon2 from 'argon2';
import type { DatabaseHandle } from '../client.js';
import { newId } from '../id.js';
import {
  SEED_BOARDS,
  SEED_LABELS,
  SEED_OWNER_KEY,
  SEED_PASSWORD,
  SEED_USERS,
  SEED_WORKSPACE_NAME,
  type SeedCard,
} from './prototype.js';

/**
 * Recreates the three prototype boards (FS §9, FB-01 §3).
 *
 * The seed is idempotent: it deletes its own workspace and users first, so
 * running `pnpm db:seed` twice leaves the same row counts (FB-01 §4 item 8).
 * It never touches rows it did not create.
 */

/** Every table the seed writes, in reverse foreign-key order. */
const SEED_TABLES = [
  'activity_event',
  'comment',
  'checklist_item',
  'card_member',
  'card_label',
  'card',
  'list',
  'label',
  'board_star',
  'board_member',
  'board',
  'workspace_member',
  'workspace',
  'funnel_event',
  'session',
  'invitation',
  'user',
] as const;

/**
 * Empties every application table. Used by the seed and by the integration
 * test helper `resetDatabase()` (STANDARDS §4).
 */
export async function resetDatabase(handle: DatabaseHandle): Promise<void> {
  const tables = SEED_TABLES.map((table) => `"${table}"`).join(', ');

  await handle.sql.unsafe(`truncate table ${tables} restart identity cascade`);
}

export interface SeedResult {
  readonly workspaceId: string;
  readonly ownerId: string;
  readonly userIdsByKey: ReadonlyMap<string, string>;
  readonly boardIdsByKey: ReadonlyMap<string, string>;
}

/**
 * `due_at` as a UTC ISO 8601 string. The driver is given text rather than a
 * `Date` so the `timestamptz` parameter type is unambiguous on the wire.
 */
function dueDate(card: SeedCard, now: Date): string | null {
  if (card.dueInDays === undefined) return null;

  const due = new Date(now);
  due.setDate(due.getDate() + card.dueInDays);

  return due.toISOString();
}

/**
 * Seeds the prototype data. Resets first, so it is safe to run repeatedly
 * against a local database.
 */
export async function seedPrototype(handle: DatabaseHandle): Promise<SeedResult> {
  const now = new Date();
  // One hash for one shared documented password: argon2id is deliberately slow.
  const passwordHash = await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id });

  await resetDatabase(handle);

  const userIdsByKey = new Map<string, string>();
  const boardIdsByKey = new Map<string, string>();

  await handle.sql.begin(async (tx) => {
    for (const user of SEED_USERS) {
      const id = newId();
      userIdsByKey.set(user.key, id);

      await tx`
        insert into "user" (id, email, password_hash, display_name, initials, avatar_color, theme)
        values (${id}, ${user.email}, ${passwordHash}, ${user.displayName},
                ${user.initials}, ${user.avatarColor}, 'system')
      `;
    }

    const ownerId = userIdsByKey.get(SEED_OWNER_KEY);
    if (ownerId === undefined) {
      throw new Error(`Seed owner ${SEED_OWNER_KEY} is not in SEED_USERS`);
    }

    const workspaceId = newId();
    await tx`
      insert into workspace (id, name, plan, created_by)
      values (${workspaceId}, ${SEED_WORKSPACE_NAME}, 'free', ${ownerId})
    `;

    for (const user of SEED_USERS) {
      const userId = userIdsByKey.get(user.key)!;
      await tx`
        insert into workspace_member (workspace_id, user_id, role)
        values (${workspaceId}, ${userId}, ${user.key === SEED_OWNER_KEY ? 'admin' : 'member'})
      `;
    }

    for (const board of SEED_BOARDS) {
      const boardId = newId();
      boardIdsByKey.set(board.key, boardId);

      await tx`
        insert into board (id, workspace_id, name, color, created_by)
        values (${boardId}, ${workspaceId}, ${board.name}, ${board.color}, ${ownerId})
      `;

      for (const memberKey of board.memberKeys) {
        const userId = userIdsByKey.get(memberKey);
        if (userId === undefined) throw new Error(`Unknown board member key ${memberKey}`);

        await tx`
          insert into board_member (board_id, user_id, role)
          values (${boardId}, ${userId}, ${memberKey === SEED_OWNER_KEY ? 'admin' : 'member'})
        `;
      }

      for (const starKey of board.starredByKeys) {
        const userId = userIdsByKey.get(starKey);
        if (userId === undefined) throw new Error(`Unknown star key ${starKey}`);

        await tx`insert into board_star (board_id, user_id) values (${boardId}, ${userId})`;
      }

      // Six board-scoped labels per board (CL-D3), keyed l1..l6 for the cards.
      const labelIdsByKey = new Map<string, string>();
      for (const label of SEED_LABELS) {
        const labelId = newId();
        labelIdsByKey.set(label.key, labelId);

        await tx`
          insert into label (id, board_id, name, color)
          values (${labelId}, ${boardId}, ${label.name}, ${label.color})
        `;
      }

      let listPosition: number | null = null;

      for (const list of board.lists) {
        listPosition = positionAtEnd(listPosition);
        const listId = newId();

        await tx`
          insert into list (id, board_id, name, position, wip_limit)
          values (${listId}, ${boardId}, ${list.name}, ${listPosition}, ${list.wipLimit})
        `;

        for (const [cardIndex, card] of list.cards.entries()) {
          const cardId = newId();
          const position = (cardIndex + 1) * POSITION_STEP;

          await tx`
            insert into card (id, list_id, title, description, position, due_at, due_complete, created_by)
            values (${cardId}, ${listId}, ${card.title}, ${card.description ?? null},
                    ${position}, ${dueDate(card, now)}, ${card.dueComplete ?? false}, ${ownerId})
          `;

          for (const labelKey of card.labelKeys ?? []) {
            const labelId = labelIdsByKey.get(labelKey);
            if (labelId === undefined) throw new Error(`Unknown label key ${labelKey}`);

            await tx`insert into card_label (card_id, label_id) values (${cardId}, ${labelId})`;
          }

          for (const memberKey of card.memberKeys ?? []) {
            const userId = userIdsByKey.get(memberKey);
            if (userId === undefined) throw new Error(`Unknown card member key ${memberKey}`);

            await tx`insert into card_member (card_id, user_id) values (${cardId}, ${userId})`;
          }

          for (const [itemIndex, item] of (card.checklist ?? []).entries()) {
            await tx`
              insert into checklist_item (id, card_id, text, done, position)
              values (${newId()}, ${cardId}, ${item.text}, ${item.done},
                      ${(itemIndex + 1) * POSITION_STEP})
            `;
          }

          for (const comment of card.comments ?? []) {
            const authorId = userIdsByKey.get(comment.authorKey);
            if (authorId === undefined) {
              throw new Error(`Unknown comment author key ${comment.authorKey}`);
            }

            await tx`
              insert into "comment" (id, card_id, author_id, body)
              values (${newId()}, ${cardId}, ${authorId}, ${comment.body})
            `;
          }

          // Every prototype card carries a `created this card` activity entry.
          await tx`
            insert into activity_event (id, card_id, actor_id, type, payload)
            values (${newId()}, ${cardId}, ${ownerId}, 'card.created', '{}'::jsonb)
          `;
        }
      }
    }
  });

  const ownerId = userIdsByKey.get(SEED_OWNER_KEY)!;
  const workspaceRows = await handle.sql<{ id: string }[]>`select id from workspace limit 1`;
  const workspaceId = workspaceRows[0]?.id;

  if (workspaceId === undefined) {
    throw new Error('Seed finished without a workspace row');
  }

  return { workspaceId, ownerId, userIdsByKey, boardIdsByKey };
}
