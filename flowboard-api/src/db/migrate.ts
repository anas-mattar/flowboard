import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase, type DatabaseHandle } from './client.js';

/**
 * Migration runner (STANDARDS §1.3: migrations only, every migration has a
 * tested down path).
 *
 * `up` delegates to the Drizzle migrator, which records applied migrations in
 * `drizzle.__drizzle_migrations`. `down` is ours: Drizzle generates no down
 * SQL, so each `NNNN_name.sql` has a hand-written `NNNN_name.down.sql`
 * alongside it. `down` rolls back the most recently applied migration (or all
 * of them with `--all`), runs that file in a transaction, and removes the
 * ledger row so `up` can re-apply it.
 */

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

export interface AppliedMigration {
  readonly id: number;
  readonly hash: string;
  readonly createdAt: string;
}

/** Applies every pending migration. */
export async function migrateUp(handle: DatabaseHandle): Promise<void> {
  await migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER });
}

/**
 * Applied migrations, newest first. Returns `[]` when the ledger table does
 * not exist yet, i.e. nothing has ever been applied.
 */
export async function appliedMigrations(handle: DatabaseHandle): Promise<AppliedMigration[]> {
  const present = await handle.sql<{ exists: boolean }[]>`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
    ) as exists
  `;

  if (present[0]?.exists !== true) return [];

  const rows = await handle.sql<AppliedMigration[]>`
    select id, hash, created_at as "createdAt"
    from drizzle."__drizzle_migrations"
    order by created_at desc, id desc
  `;

  return [...rows];
}

/**
 * The `.sql` migration file names in the folder, in application order. The
 * Drizzle ledger stores a hash rather than the name, so rollback order comes
 * from the filenames and the ledger only says how many are applied.
 */
export async function migrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_FOLDER);

  return entries
    .filter((entry) => entry.endsWith('.sql') && !entry.endsWith('.down.sql'))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Rolls back the newest applied migration. With `all`, rolls back every
 * applied migration, newest first, leaving an empty schema.
 *
 * Returns the migration file names that were rolled back.
 */
export async function migrateDown(
  handle: DatabaseHandle,
  options: { readonly all?: boolean } = {},
): Promise<string[]> {
  const applied = await appliedMigrations(handle);
  if (applied.length === 0) return [];

  const files = await migrationFiles();
  const steps = options.all === true ? applied.length : 1;
  const rolledBack: string[] = [];

  for (let step = 0; step < steps; step += 1) {
    const ledgerRow = applied[step];
    const file = files[applied.length - 1 - step];

    if (ledgerRow === undefined || file === undefined) {
      throw new Error(
        `Migration ledger and ${MIGRATIONS_FOLDER} disagree: ${applied.length} applied, ${files.length} files on disk.`,
      );
    }

    const downFile = file.replace(/\.sql$/, '.down.sql');
    const downPath = path.join(MIGRATIONS_FOLDER, downFile);

    let downSql: string;
    try {
      downSql = await readFile(downPath, 'utf8');
    } catch {
      throw new Error(
        `Migration ${file} has no down path. Every migration needs a hand-written ${downFile} (STANDARDS §1.3).`,
      );
    }

    // Drizzle splits migration files on this marker; the down files use it too.
    const statements = downSql
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    await handle.sql.begin(async (tx) => {
      for (const statement of statements) {
        await tx.unsafe(statement);
      }
      await tx`delete from drizzle.__drizzle_migrations where id = ${ledgerRow.id}`;
    });

    rolledBack.push(file);
  }

  return rolledBack;
}

/** CLI entry point: `tsx src/db/migrate.ts [up|down] [--all]`. */
async function main(): Promise<void> {
  const [command = 'up', ...flags] = process.argv.slice(2);
  const connectionString = process.env['DATABASE_URL'];

  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run migrations. See .env.example.');
  }

  const handle = createDatabase(connectionString, 1);

  try {
    if (command === 'up') {
      await migrateUp(handle);
      process.stdout.write('migrations applied\n');
      return;
    }

    if (command === 'down') {
      const rolledBack = await migrateDown(handle, { all: flags.includes('--all') });
      process.stdout.write(
        rolledBack.length === 0
          ? 'nothing to roll back\n'
          : `rolled back: ${rolledBack.join(', ')}\n`,
      );
      return;
    }

    throw new Error(`Unknown command "${command}". Use "up" or "down".`);
  } finally {
    await handle.close();
  }
}

const invokedAs = process.argv[1];
const isCli =
  invokedAs !== undefined &&
  path.resolve(invokedAs) === path.resolve(fileURLToPath(import.meta.url));

if (isCli) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
