import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/** The handle Drizzle hands to a `db.transaction()` callback. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Anything that can run a statement. Repository functions take this so the
 * same function works standalone and inside the signup transaction
 * (FB-02 §4 item 1).
 */
export type DbExecutor = Database | Transaction;

export interface DatabaseHandle {
  readonly db: Database;
  readonly sql: postgres.Sql;
  close: () => Promise<void>;
}

/** Creates a Drizzle client, bound to the FB-01 schema, over a postgres-js pool. */
export function createDatabase(connectionString: string, maxConnections = 10): DatabaseHandle {
  const sql = postgres(connectionString, { max: maxConnections, onnotice: () => {} });
  const db = drizzle(sql, { schema });

  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}
