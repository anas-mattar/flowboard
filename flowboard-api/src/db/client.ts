import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

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
