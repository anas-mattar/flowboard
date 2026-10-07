import type { ActivityEventType } from '@flowboard/shared';
import { desc, eq } from 'drizzle-orm';
import type { DatabaseHandle, DbExecutor } from '../db/client.js';
import { newId } from '../db/id.js';
import { activityEventTable, type ActivityEventRow } from '../db/schema/activity-event.js';

/**
 * The only way application code touches `activity_event` (FS §5.2,
 * STANDARDS §1.3). Activity is append-only and never edited — it is the audit
 * trail — so this repository exposes insert and read, and nothing else.
 *
 * In production a database role without `UPDATE`/`DELETE` on the table is the
 * real enforcement (FB-20). This module is the application-level guard that
 * makes an accidental mutation fail loudly in development and in tests.
 */

/** Thrown when code tries to mutate an activity event. */
export class ActivityEventImmutableError extends Error {
  public override readonly name = 'ActivityEventImmutableError';

  constructor(operation: string) {
    super(
      `activity_event is append-only (FS §5.2); ${operation} is not permitted. Record a new event instead.`,
    );
  }
}

export interface NewActivityEvent {
  readonly cardId: string;
  readonly actorId: string;
  readonly type: ActivityEventType;
  readonly payload?: Record<string, unknown>;
}

/**
 * Either kind of handle a caller may hold: the standalone `DatabaseHandle` the
 * FB-01 tests use, or the executor a route is already inside a transaction
 * with. FB-05 archives a list and writes one event per card atomically, which
 * needs the latter.
 */
type ActivityExecutor = DatabaseHandle | DbExecutor;

function executorOf(handle: ActivityExecutor): DbExecutor {
  return 'db' in handle ? handle.db : handle;
}

/** Appends one activity event and returns the stored row. */
export async function appendActivityEvent(
  handle: ActivityExecutor,
  event: NewActivityEvent,
): Promise<ActivityEventRow> {
  const [row] = await executorOf(handle)
    .insert(activityEventTable)
    .values({
      id: newId(),
      cardId: event.cardId,
      actorId: event.actorId,
      type: event.type,
      payload: event.payload ?? {},
    })
    .returning();

  if (row === undefined) {
    throw new Error('Inserting an activity event returned no row');
  }

  return row;
}

/**
 * Appends a batch of events in one statement (FS §5.2). Archiving a list of
 * 200 cards writes 200 events; as separate inserts that is 200 round trips
 * inside the transaction holding the row locks.
 *
 * An empty batch is a no-op rather than an empty `INSERT`, because a sort that
 * changed nothing legitimately has no events to write (CL-A14).
 */
export async function appendActivityEvents(
  handle: ActivityExecutor,
  events: readonly NewActivityEvent[],
): Promise<ActivityEventRow[]> {
  if (events.length === 0) return [];

  return executorOf(handle)
    .insert(activityEventTable)
    .values(
      events.map((event) => ({
        id: newId(),
        cardId: event.cardId,
        actorId: event.actorId,
        type: event.type,
        payload: event.payload ?? {},
      })),
    )
    .returning();
}

/** The activity feed for one card, newest first (C-12). */
export async function listActivityEventsForCard(
  handle: DatabaseHandle,
  cardId: string,
): Promise<ActivityEventRow[]> {
  return handle.db
    .select()
    .from(activityEventTable)
    .where(eq(activityEventTable.cardId, cardId))
    .orderBy(desc(activityEventTable.createdAt));
}

/**
 * Explicit refusals. They exist so that a caller reaching for a mutation finds
 * a named error and this comment, instead of writing a raw Drizzle `update` or
 * `delete` against the table.
 */
export function updateActivityEvent(): never {
  throw new ActivityEventImmutableError('update');
}

export function deleteActivityEvent(): never {
  throw new ActivityEventImmutableError('delete');
}

/** The repository's complete surface; asserted by the insert-only test. */
export const activityEventRepository = {
  append: appendActivityEvent,
  listForCard: listActivityEventsForCard,
} as const;
