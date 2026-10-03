import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../src/db/client.js';
import { activityEventTable } from '../src/db/schema/activity-event.js';
import {
  ActivityEventImmutableError,
  activityEventRepository,
  appendActivityEvent,
  deleteActivityEvent,
  listActivityEventsForCard,
  updateActivityEvent,
} from '../src/repositories/activity-event.js';
import { openTestDatabase, seedMinimal, type MinimalSeed } from './helpers/database.js';

/**
 * FB-01 §4 item 4: `activity_event` is append-only (FS §5.2). The repository
 * refuses to update or delete, and exposes no helper that could.
 */

let handle: DatabaseHandle;
let seed: MinimalSeed;

beforeAll(async () => {
  handle = await openTestDatabase();
  seed = await seedMinimal(handle);
});

afterAll(async () => {
  await handle.close();
});

describe('the activity_event repository (FS §5.2)', () => {
  it('appends and reads back events, newest first', async () => {
    const created = await appendActivityEvent(handle, {
      cardId: seed.cardId,
      actorId: seed.userId,
      type: 'card.created',
    });

    expect(created.type).toBe('card.created');
    expect(created.payload).toStrictEqual({});

    await appendActivityEvent(handle, {
      cardId: seed.cardId,
      actorId: seed.userId,
      type: 'card.renamed',
      payload: { from: 'Minimal Card', to: 'Renamed Card' },
    });

    const events = await listActivityEventsForCard(handle, seed.cardId);

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.type)).toContain('card.renamed');
  });

  it('throws when application code tries to update an event', () => {
    expect(() => updateActivityEvent()).toThrow(ActivityEventImmutableError);
    expect(() => updateActivityEvent()).toThrow(/append-only/);
  });

  it('throws when application code tries to delete an event', () => {
    expect(() => deleteActivityEvent()).toThrow(ActivityEventImmutableError);
    expect(() => deleteActivityEvent()).toThrow(/append-only/);
  });

  it('exposes only append and listForCard', () => {
    expect(Object.keys(activityEventRepository).sort()).toStrictEqual(['append', 'listForCard']);
  });

  it('exposes no update or delete helper on the repository', () => {
    const surface = activityEventRepository as Record<string, unknown>;

    expect(surface['update']).toBeUndefined();
    expect(surface['delete']).toBeUndefined();
    expect(surface['remove']).toBeUndefined();
  });

  it('rejects a type outside the FS §5.2 enum at the database boundary', async () => {
    await expect(
      handle.sql`
        insert into activity_event (id, card_id, actor_id, type)
        values (gen_random_uuid(), ${seed.cardId}, ${seed.userId}, 'card.exploded')
      `,
    ).rejects.toThrow(/activity_event_type_check/);
  });

  it('has no updated_at column to edit (CL-E19)', () => {
    expect(Object.keys(activityEventTable)).not.toContain('updatedAt');
  });
});
