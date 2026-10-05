import type { APIRequestContext, Page } from '@playwright/test';

export interface TestUser {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
}

/** Seeded owner from `flowboard-api/src/db/seed/prototype.ts` (workspace admin). */
export const SEEDED_USER: TestUser = {
  email: 'anas@example.test',
  password: 'flowboard-dev',
  displayName: 'Anas Matar',
};

/**
 * Builds a unique signup payload so parallel workers, retries and repeated
 * local runs never collide on `409 email_taken`. The suite runs with
 * `RATE_LIMIT_DISABLED=true` (STANDARDS §4, FB-02 spec §9), so creating one
 * account per test that needs its own session is safe here even though the
 * same calls would trip CL-E11 against a rate-limited environment.
 */
export function makeTestUser(label: string): TestUser {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    email: `e2e-${label}-${unique}@example.test`.toLowerCase(),
    password: 'correct horse battery staple',
    displayName: `E2E ${label}`,
  };
}

/**
 * Creates the account through the real API (not the signup form) and leaves
 * the resulting `fb_session` cookie in `request`'s context. A `page` sharing
 * that context is already signed in on its next navigation.
 */
export async function signUpViaApi(request: APIRequestContext, user: TestUser): Promise<void> {
  const response = await request.post('/v1/auth/signup', { data: user });
  if (!response.ok()) {
    throw new Error(`API signup failed: ${response.status()} ${await response.text()}`);
  }
}

/** Signs up a fresh user via the API and lands the page on `/`, signed in. */
export async function signInFreshUser(page: Page, label: string): Promise<TestUser> {
  const user = makeTestUser(label);
  await signUpViaApi(page.request, user);
  await page.goto('/');
  return user;
}
