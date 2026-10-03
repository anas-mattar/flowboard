import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from '../src/db/client.js';

const connectionString = process.env['DATABASE_URL_TEST'];

if (!connectionString) {
  throw new Error(
    'DATABASE_URL_TEST is required for integration tests. Run `docker compose up -d` and copy .env.example to .env.',
  );
}

let handle: DatabaseHandle;

beforeAll(() => {
  handle = createDatabase(connectionString, 2);
});

afterAll(async () => {
  await handle.close();
});

describe('flowboard_test database', () => {
  it('answers select 1', async () => {
    const rows = await handle.db.execute<{ one: number }>(sql`select 1 as one`);
    expect(rows[0]?.one).toBe(1);
  });

  it('is the test database, not the development database (CL-E21)', async () => {
    const rows = await handle.db.execute<{ name: string }>(sql`select current_database() as name`);
    expect(rows[0]?.name).toBe('flowboard_test');
  });
});
