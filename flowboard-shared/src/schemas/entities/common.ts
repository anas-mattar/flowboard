import { z } from 'zod';

/**
 * Building blocks shared by every entity schema (FB-01 §6).
 *
 * Column names are `snake_case`; JSON fields are `camelCase`. All timestamps
 * are UTC ISO 8601 strings in JSON (FB-01 §6), never `Date` objects, so the
 * same schema validates a response body and a WebSocket frame.
 */

/** A UUID v7 primary key. Validated as a UUID; the version is set by the writer. */
export const uuidSchema = z.uuid();

/** UTC ISO 8601 timestamp, e.g. `2026-10-03T13:16:02.533Z`. Offsets are rejected. */
export const isoTimestampSchema = z.iso.datetime();

/** Hex colour as stored by the prototype, e.g. `#3d6df0`. */
export const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, 'must be a #rrggbb hex colour');

/** A sparse-float ordering position (FS §5.1). Always finite and positive. */
export const positionSchema = z.number().finite().positive();

/** `archived_at`: `null` while live, a timestamp once soft-deleted (CL-A2). */
export const archivedAtSchema = isoTimestampSchema.nullable();
