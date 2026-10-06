import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env['CI']);

// Per-agent port convention (TAS-108, see e2e/README.md): on the shared
// runner several agents run this suite at once, so a hard-pinned port meant
// one local run could silently attach to another agent's dev server
// (reuseExistingServer: true) and "verify" a branch it never loaded. Each
// agent/worktree picks its own WEB_PORT/API_PORT pair instead; CI and the
// documented default stay 5173/3000, matching the previous behaviour.
const WEB_PORT = Number(process.env['WEB_PORT'] ?? 5173);
const API_PORT = Number(process.env['API_PORT'] ?? 3000);

// X-01's 200ms toast-latency budget (FS X-01, FB-04 AC10) is a spec
// assertion, not a flaky network call: a CI retry that happens to land
// under budget would mask a real regression (TAS-106, TAS-23 both saw a
// retried pass hide a 228ms/229ms miss on firefox). Route it to its own
// per-browser projects with retries: 0 so a marginal miss fails the job
// outright instead of being rescued by the suite-wide CI retry count.
const X01_TITLE = /X-01/;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', grepInvert: X01_TITLE, use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', grepInvert: X01_TITLE, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', grepInvert: X01_TITLE, use: { ...devices['Desktop Safari'] } },
    {
      name: 'chromium-x01',
      grep: X01_TITLE,
      retries: 0,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox-x01',
      grep: X01_TITLE,
      retries: 0,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit-x01',
      grep: X01_TITLE,
      retries: 0,
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
    url: `http://localhost:${WEB_PORT}`,
    // Always false (not `!isCI`): a local run must fail loudly on a taken
    // port (via --strictPort above) rather than silently reuse whatever
    // dev server already holds it, which may be serving a different branch.
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_API_PROXY_TARGET: `http://localhost:${API_PORT}`,
    },
  },
});
