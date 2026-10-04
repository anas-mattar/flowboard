import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { messages } from '../src/i18n/messages';
import { signInFreshUser, signUpViaApi, makeTestUser } from './support/auth';

// FB-03 spec §10 end-to-end row. Each test signs up a fresh user through the
// real API (STANDARDS §4) rather than the seeded owner, so shell layout
// assertions are never coupled to the seeded prototype's board data.

const THEME_TOGGLE_NAME = /^Theme:/;

test('X-02 toggles theme instantly and persists across reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await signInFreshUser(page, 'theme-toggle');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // A fresh account's theme preference defaults to `system` (resolved to
  // `light` here via `emulateMedia`), and the toggle cycles
  // light -> dark -> system -> light, so it takes two clicks from a fresh
  // signup to land on `dark`: system -> light -> dark.
  const themeToggle = page.getByRole('button', { name: THEME_TOGGLE_NAME });
  await themeToggle.click();
  await themeToggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('X-02 theme follows the user into a second browser context', async ({ page, browser }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  const user = await signInFreshUser(page, 'theme-context');

  // See the cycle-order note above: two clicks from a fresh signup's
  // `system` default land on `dark`.
  const themeToggle = page.getByRole('button', { name: THEME_TOGGLE_NAME });
  await themeToggle.click();
  await themeToggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  const secondContext = await browser.newContext();
  try {
    const secondPage = await secondContext.newPage();
    await secondPage.emulateMedia({ colorScheme: 'light' });
    await secondPage.goto('/login');
    await secondPage.getByLabel(messages.auth.login.email).fill(user.email);
    await secondPage.getByLabel(messages.auth.login.password, { exact: true }).fill(user.password);
    await secondPage.getByRole('button', { name: messages.auth.login.submit }).click();

    await expect(secondPage).toHaveURL('/');
    // No `flowboard:theme` in this context's localStorage: the dark value
    // here can only have come from the server (CL-E13), not a local mirror.
    await expect(secondPage.locator('html')).toHaveAttribute('data-theme', 'dark');
  } finally {
    await secondContext.close();
  }
});

test('X-04 collapses the sidebar and expands the content', async ({ page }) => {
  await signInFreshUser(page, 'collapse');

  const sidebar = page.locator('#app-sidebar');
  const main = page.locator('#main-content');
  const expandedWidth = (await main.boundingBox())?.width ?? 0;

  const toggle = page.getByRole('button', { name: messages.shell.toggleSidebar });
  await toggle.click();
  await expect(sidebar).toHaveAttribute('data-visible', 'false');
  // The width change follows a CSS transition, not the `data-visible` flip,
  // so poll rather than read the bounding box the instant the attribute lands.
  await expect
    .poll(async () => (await main.boundingBox())?.width ?? 0)
    .toBeGreaterThan(expandedWidth);

  await toggle.click();
  await expect(sidebar).toHaveAttribute('data-visible', 'true');
});

test('X-04 collapse state persists on reload', async ({ page }) => {
  await signInFreshUser(page, 'collapse-reload');

  await page.getByRole('button', { name: messages.shell.toggleSidebar }).click();
  await expect(page.locator('#app-sidebar')).toHaveAttribute('data-visible', 'false');

  await page.reload();
  await expect(page.locator('#app-sidebar')).toHaveAttribute('data-visible', 'false');
});

test('FB-03 redirects signed-out visitor and returns to next after login', async ({ page }) => {
  // `/boards/$boardId` (the spec's example protected path) is FB-04 frontend
  // scope and does not exist on `main` yet (TAS-21 release note); `/` is the
  // only route under `authenticatedLayoutRoute` today, so it stands in here.
  // Re-check against a real board route once FB-04's frontend task lands.
  const user = makeTestUser('next-redirect');
  await signUpViaApi(page.request, user);
  await page.context().clearCookies();

  await page.goto('/');
  await expect(page).toHaveURL(/\/login\?next=/);

  await page.getByLabel(messages.auth.login.email).fill(user.email);
  await page.getByLabel(messages.auth.login.password, { exact: true }).fill(user.password);
  await page.getByRole('button', { name: messages.auth.login.submit }).click();
  await expect(page).toHaveURL('/');

  // Second half of acceptance criterion 5: a signed-in visitor hitting
  // `/login` directly is bounced back to `/`.
  await page.goto('/login');
  await expect(page).toHaveURL('/');
});

test('FB-03 tab order and focus rings', async ({ page }) => {
  await signInFreshUser(page, 'tab-order');

  async function expectFocusedAndRinged(locator: ReturnType<typeof page.getByRole>) {
    await expect(locator).toBeFocused();
    const outlineStyle = await locator.evaluate((node) => getComputedStyle(node).outlineStyle);
    expect(outlineStyle).not.toBe('none');
  }

  // Acceptance criterion 6: skip link, ☰, top-bar controls, sidebar items,
  // footer menu, main content.
  await page.keyboard.press('Tab');
  await expectFocusedAndRinged(page.getByRole('link', { name: messages.app.skipToContent }));

  await page.keyboard.press('Tab');
  await expectFocusedAndRinged(page.getByRole('button', { name: messages.shell.toggleSidebar }));

  await page.keyboard.press('Tab');
  await expectFocusedAndRinged(page.getByRole('button', { name: messages.shell.search }));

  await page.keyboard.press('Tab');
  await expectFocusedAndRinged(page.getByRole('button', { name: messages.shell.filter }));

  await page.keyboard.press('Tab');
  await expectFocusedAndRinged(page.getByRole('button', { name: messages.shell.members }));

  await page.keyboard.press('Tab');
  await expectFocusedAndRinged(page.getByRole('button', { name: messages.shell.invite }));

  await page.keyboard.press('Tab');
  await expectFocusedAndRinged(page.getByRole('button', { name: THEME_TOGGLE_NAME }));

  // No board rows exist yet (FB-04), so the sidebar's only item is the
  // footer menu trigger.
  await page.keyboard.press('Tab');
  await expectFocusedAndRinged(page.getByRole('button', { name: messages.shell.userMenu }));
});

test('FB-03 shell at 768 px overlays sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await signInFreshUser(page, 'mobile-768');

  const sidebar = page.locator('#app-sidebar');
  await expect(sidebar).toHaveAttribute('data-visible', 'false');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  await page.getByRole('button', { name: messages.shell.toggleSidebar }).click();
  await expect(sidebar).toHaveAttribute('data-visible', 'true');
  await expect(page.locator('.shell__scrim')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 1280, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('FB-03 RTL renders without breakage', async ({ page }) => {
  await signInFreshUser(page, 'rtl');
  await page.evaluate(() => {
    document.documentElement.dir = 'rtl';
  });

  const sidebarBox = await page.locator('#app-sidebar').boundingBox();
  const mainBox = await page.locator('#main-content').boundingBox();
  expect(sidebarBox).not.toBeNull();
  expect(mainBox).not.toBeNull();
  // Logical `margin-inline-start` puts the sidebar on the physical right in RTL.
  expect(sidebarBox!.x).toBeGreaterThan(mainBox!.x);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

const SHELL_THEMES = ['light', 'dark'] as const;

for (const colorScheme of SHELL_THEMES) {
  test(`FB-03 shell is axe-clean, sidebar expanded (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await signInFreshUser(page, `axe-expanded-${colorScheme}`);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test(`FB-03 shell is axe-clean, sidebar collapsed (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await signInFreshUser(page, `axe-collapsed-${colorScheme}`);
    await page.getByRole('button', { name: messages.shell.toggleSidebar }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  // Targets the two a11y findings deferred from the FB-03 review (TAS-64):
  // the hand-rolled `menu`/`menuitemradio` roles in `UserMenu`, exercised
  // here with the popover open.
  test(`FB-03 footer menu is axe-clean (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await signInFreshUser(page, `axe-menu-${colorScheme}`);
    await page.getByRole('button', { name: messages.shell.userMenu }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test('FB-03 toast live region is present and statically announced', async ({ page }) => {
  // The other deferred TAS-64 finding (toast `aria-live` pairing). No FB-03
  // screen triggers a toast yet (first real use is FB-04), so this only
  // verifies the persistent region's static wiring; see the verification
  // report's "Unverified behaviour" for what remains unexercised.
  await signInFreshUser(page, 'toast-region');
  const region = page.locator('.toast-region');
  await expect(region).toHaveAttribute('role', 'status');
  await expect(region).toHaveAttribute('aria-live', 'polite');
});
