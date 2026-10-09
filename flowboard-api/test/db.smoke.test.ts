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

  it('is a test database, not the development database (CL-E21)', async () => {
    const rows = await handle.db.execute<{ name: string }>(sql`select current_database() as name`);

    // `flowboard_test` in CI, plus the per-agent throwaway databases the
    // TAS-108 isolation convention creates (`flowboard_test_tas161` and the
    // like). What CL-E21 guards against is running against `flowboard`.
    expect(rows[0]?.name).toMatch(/^flowboard_test(_[a-z0-9_]+)?$/);
  });
});
