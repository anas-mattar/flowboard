import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { messages } from '../src/i18n/messages';

const THEMES = ['light', 'dark'] as const;

for (const colorScheme of THEMES) {
  test(`FB-00 app shell renders and is axe-clean (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: messages.appName })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}
