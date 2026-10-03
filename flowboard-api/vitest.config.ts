import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests import `@flowboard/shared` from source so a build is never a prerequisite.
const sharedSource = fileURLToPath(new URL('../flowboard-shared/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@flowboard/shared': sharedSource },
  },
  test: {
    projects: [
      {
        resolve: { alias: { '@flowboard/shared': sharedSource } },
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias: { '@flowboard/shared': sharedSource } },
        test: {
          name: 'integration',
          include: ['test/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['./test/setup/load-dotenv.ts'],
          hookTimeout: 30_000,
          testTimeout: 30_000,
          // Every file shares the one `DATABASE_URL_TEST` database and
          // truncates or re-migrates it, so files must not overlap. The
          // `test:integration` script passes `--no-file-parallelism`;
          // `fileParallelism` is a runner-wide option and is ignored here.
        },
      },
    ],
  },
});
