import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { messages } from '../src/i18n/messages';

const THEMES = ['light', 'dark'] as const;

// `/` has required a session since FB-02 (src/routes/index.tsx `beforeLoad`):
// an unauthenticated visitor is redirected to `/login`. This suite only
// covers the signed-out entry point; FB-02's own e2e suite (signed-up,
// signed-in flows) is tracked separately.
for (const colorScheme of THEMES) {
  test(`FB-00 app shell redirects to sign in and is axe-clean (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    // FB-03's route guard redirects with `?next=<path>` (acceptance criterion 5,
    // src/routes/authenticated.tsx) so the matched URL carries a query string.
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
    await expect(page.getByRole('heading', { name: messages.auth.login.title })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}
