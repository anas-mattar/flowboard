# Running the Playwright suite locally

`playwright.config.ts`'s `webServer` only starts the Vite dev server
(`flowboard-web`). The API is not part of that `webServer` block, so you must
build and run `flowboard-api` yourself, pointed at the isolated
`flowboard_test` database from `docker-compose.yml` (never the shared dev
database):

```powershell
$env:DATABASE_URL = "postgres://flowboard:flowboard@localhost:5432/flowboard_test"
pnpm --filter ./flowboard-api run db:migrate
pnpm --filter ./flowboard-api run db:seed
pnpm --filter ./flowboard-api run build

$env:PORT = "3000"
$env:CORS_ORIGIN = "http://localhost:5173"
$env:SESSION_COOKIE_SECURE = "false"
$env:LOG_LEVEL = "info"
$env:RATE_LIMIT_DISABLED = "true"
node flowboard-api/dist/src/server.js

# in flowboard-web
pnpm exec playwright test
```

## `RATE_LIMIT_DISABLED`

Each test in this suite signs up a fresh user through the real
`/v1/auth/signup` endpoint (STANDARDS §4), so a full run across Chromium,
Firefox and WebKit performs many signups per minute against the same
in-memory, per-IP auth rate limiter (CL-E11,
`flowboard-api/src/auth/rate-limit.ts`). Without
`RATE_LIMIT_DISABLED=true` the limiter throttles the suite's own fixtures
with `429 rate_limited`, not a real defect: the FB-03 shell suite measured 22
failures without the flag and 45 passes with it (TAS-83 verification run).

`RATE_LIMIT_DISABLED` is a first-class flag in
`flowboard-api/src/config/env.ts`, set to `true` by `.github/workflows/ci.yml`
for the same reason. **CI and production never set it** — `.env.example`
defaults it to `false` and it exists purely as a no-op mode for tests and
local tooling. Do not set it when testing rate-limit behaviour itself;
`flowboard-api/test/auth.ratelimit.test.ts` covers that separately with the
flag off.
