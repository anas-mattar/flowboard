import { z } from 'zod';
import { activityEventTypeSchema } from '../events.js';
import { isoTimestampSchema, uuidSchema } from './common.js';
import { publicUserSchema } from './user.js';

/**
 * An activity event (FS §5.2). Append-only and never edited — it is the audit
 * trail. FS §7 requires the realtime broadcast and the stored row to be the
 * same object, so this one schema serves both (STANDARDS §1.2).
 *
 * `payload` is an open JSON object in FB-01; the per-type payload schemas
 * arrive with the routes that emit each event (FB-04 onward).
 */
export const activityEventSchema = z
  .object({
    id: uuidSchema,
    cardId: uuidSchema,
    actor: publicUserSchema,
    type: activityEventTypeSchema,
    payload: z.record(z.string(), z.unknown()),
    createdAt: isoTimestampSchema,
  })
  .describe('ActivityEvent');

export type ActivityEvent = z.infer<typeof activityEventSchema>;
