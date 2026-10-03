import { createDatabase } from '../client.js';
import { SEED_COUNTS, SEED_EMAIL_DOMAIN, SEED_PASSWORD } from './prototype.js';
import { seedPrototype } from './seed.js';

/**
 * `pnpm db:seed` (FB-01 §3). Recreates the three prototype boards on the
 * database named by `DATABASE_URL`.
 *
 * The seed password is a documented non-secret for local development only
 * (STANDARDS §1.5); it is printed here so a developer can sign in, and it must
 * never be used anywhere but a throwaway local database.
 */
async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];

  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed. See .env.example.');
  }

  const handle = createDatabase(connectionString, 1);

  try {
    const result = await seedPrototype(handle);

    process.stdout.write(
      [
        'seeded the prototype data',
        `  workspace: ${result.workspaceId}`,
        `  users ${SEED_COUNTS.users}, boards ${SEED_COUNTS.boards}, lists ${SEED_COUNTS.lists}, cards ${SEED_COUNTS.cards}, labels ${SEED_COUNTS.labels}`,
        `  sign in as anas@${SEED_EMAIL_DOMAIN} with the documented local password "${SEED_PASSWORD}"`,
        '',
      ].join('\n'),
    );
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
