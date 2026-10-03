import { uuidv7 } from 'uuidv7';

/**
 * UUID v7 primary keys (STANDARDS §1.3). v7 is time-ordered, so inserts stay
 * local in the B-tree and `created_at` ordering matches id ordering.
 *
 * PostgreSQL 16 has no built-in `uuidv7()` (it arrives in 18), so ids are
 * generated in the application through this single helper rather than by a
 * column default.
 */
export function newId(): string {
  return uuidv7();
}
