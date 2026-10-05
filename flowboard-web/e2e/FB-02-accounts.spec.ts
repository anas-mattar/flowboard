import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { messages } from '../src/i18n/messages';
import { SEEDED_USER, makeTestUser, signUpViaApi } from './support/auth';

// FB-02 spec §10 end-to-end row. Runs against the real API and a seeded
// database (STANDARDS §4), never mocks. `RATE_LIMIT_DISABLED=true` in this
// job (FB-02 spec §9, CL-E11) so the repeated signups and logins below never
// trip the auth rate limiter that FB-02's own integration suite covers.

test('FB-02 signs up and lands signed in', async ({ page }) => {
  const user = makeTestUser('signup');

  await page.goto('/signup');
  await page.getByLabel(messages.auth.signup.displayName).fill(user.displayName);
  await page.getByLabel(messages.auth.signup.email).fill(user.email);
  const password = page.getByLabel(messages.auth.signup.password, { exact: true });
  await password.fill(user.password);
  await password.press('Enter');

  // Lands on `/` signed in, no intermediate screen (acceptance criterion 13).
  await expect(page).toHaveURL('/');
  // FB-04 replaces the FB-03 placeholder heading with the real empty-workspace state.
  await expect(page.getByRole('heading', { name: messages.boards.empty.title })).toBeVisible();
  await expect(page.getByText(user.displayName, { exact: true })).toBeVisible();
});

test('FB-02 rejects invalid signup inline', async ({ page }) => {
  await page.goto('/signup');

  const email = page.getByLabel(messages.auth.signup.email);
  await email.fill('not-an-email');
  await email.blur();
  await expect(page.getByText(messages.validation.email)).toBeVisible();
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(email).toHaveAttribute('aria-describedby', 'signup-email-error');

  // Submitting with the required display name still empty moves focus to the
  // first invalid field (acceptance criterion 14).
  await page.getByRole('button', { name: messages.auth.signup.submit }).click();
  await expect(page.getByLabel(messages.auth.signup.displayName)).toBeFocused();
  await expect(page.getByText(messages.validation.required)).toBeVisible();
});

test('FB-02 logs in with seeded user', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(messages.auth.login.email).fill(SEEDED_USER.email);
  await page.getByLabel(messages.auth.login.password, { exact: true }).fill(SEEDED_USER.password);
  await page.getByRole('button', { name: messages.auth.login.submit }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByText(SEEDED_USER.displayName, { exact: true })).toBeVisible();
  await expect(page.getByText(messages.role.workspaceAdmin)).toBeVisible();
});

test('FB-02 shows one message for bad credentials', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(messages.auth.login.email).fill(SEEDED_USER.email);
  await page
    .getByLabel(messages.auth.login.password, { exact: true })
    .fill('definitely-the-wrong-password');
  await page.getByRole('button', { name: messages.auth.login.submit }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toHaveText(messages.auth.error.invalidCredentials);
  await expect(page).toHaveURL(/\/login$/);
});

test('FB-02 signs out and is redirected to login', async ({ page }) => {
  const user = makeTestUser('signout');
  await signUpViaApi(page.request, user);
  await page.goto('/');

  await page.getByRole('button', { name: messages.shell.userMenu }).click();
  await page.getByRole('menuitem', { name: messages.auth.signOut }).click();

  await expect(page).toHaveURL(/\/login(\?.*)?$/);

  // The session is actually gone server-side, not just hidden client-side.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login(\?.*)?$/);
});

test('FB-02 redirects signed-out visitor to login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login(\?.*)?$/);
  await expect(page.getByRole('heading', { name: messages.auth.login.title })).toBeVisible();
});

test('FB-02 keyboard-only signup', async ({ page }) => {
  const user = makeTestUser('kbd');
  await page.goto('/signup');

  // Focus starts on the first field without any pointer interaction.
  const displayName = page.getByLabel(messages.auth.signup.displayName);
  await expect(displayName).toBeFocused();
  await page.keyboard.type(user.displayName);

  await page.keyboard.press('Tab');
  const email = page.getByLabel(messages.auth.signup.email);
  await expect(email).toBeFocused();
  const outlineStyle = await email.evaluate((node) => getComputedStyle(node).outlineStyle);
  expect(outlineStyle).not.toBe('none');
  await page.keyboard.type(user.email);

  await page.keyboard.press('Tab');
  const password = page.getByLabel(messages.auth.signup.password, { exact: true });
  await expect(password).toBeFocused();
  await page.keyboard.type(user.password);
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL('/');
  await expect(page.getByText(user.displayName, { exact: true })).toBeVisible();
});

const THEMES = ['light', 'dark'] as const;

for (const colorScheme of THEMES) {
  test(`FB-02 signup and login are axe-clean including the error state (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });

    // Each `goto` races SPA hydration: scanning before the route renders its
    // form catches an intermediate DOM with no `<main>`/`<h1>` yet, which is
    // slow enough to reproduce on WebKit. Wait for a stable field first.
    await page.goto('/signup');
    await expect(page.getByLabel(messages.auth.signup.email)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.goto('/login');
    await expect(page.getByLabel(messages.auth.login.email)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.getByLabel(messages.auth.login.email).fill(SEEDED_USER.email);
    await page
      .getByLabel(messages.auth.login.password, { exact: true })
      .fill('definitely-the-wrong-password');
    await page.getByRole('button', { name: messages.auth.login.submit }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
