import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Tests import `@flowboard/shared` from source so a build is never a
// prerequisite (mirrors flowboard-api/vitest.config.ts).
const sharedSource = fileURLToPath(new URL('../flowboard-shared/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@flowboard/shared': sharedSource },
  },
  test: {
    name: 'unit',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
