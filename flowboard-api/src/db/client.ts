import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export type Database = ReturnType<typeof drizzle>;

export interface DatabaseHandle {
  readonly db: Database;
  readonly sql: postgres.Sql;
  close: () => Promise<void>;
}

/**
 * Creates a Drizzle client over a postgres-js pool.
 * FB-01 adds the schema; FB-00 only proves the connection.
 */
export function createDatabase(connectionString: string, maxConnections = 10): DatabaseHandle {
  const sql = postgres(connectionString, { max: maxConnections, onnotice: () => {} });
  const db = drizzle(sql);

  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}
