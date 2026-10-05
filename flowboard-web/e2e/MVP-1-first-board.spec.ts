import { expect, test } from '@playwright/test';
import { messages } from '../src/i18n/messages';
import { makeTestUser } from './support/auth';

// FB-04 spec §10 slice-level row; BM §1's "time to first board under two
// minutes" metric as a scripted, asserted budget (not just logged), per TAS-7
// §6. Runs against the real API and database (STANDARDS §4), never mocks.
//
// Traced unconditionally (not just `on-first-retry`, the suite default) so a
// trace file always exists to attach as evidence regardless of whether the
// run passes first try.
test.use({ trace: 'on' });

test('MVP-1 new visitor reaches a persisted starred board in under two minutes', async ({
  page,
}) => {
  const start = Date.now();
  const user = makeTestUser('mvp1-slice');
  const renamedTitle = `${user.displayName}'s launch board`;

  // 1. Sign up a brand-new visitor through the real form (not the API
  // shortcut other suites use), matching BM §1's "scripted interaction".
  await page.goto('/signup');
  await page.getByLabel(messages.auth.signup.displayName).fill(user.displayName);
  await page.getByLabel(messages.auth.signup.email).fill(user.email);
  const signupPassword = page.getByLabel(messages.auth.signup.password, { exact: true });
  await signupPassword.fill(user.password);
  await signupPassword.press('Enter');

  // A fresh workspace has no boards: `/` shows the empty state with the
  // create form already focused (AC 15).
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: messages.boards.empty.title })).toBeVisible();
  const createInput = page.getByPlaceholder(messages.boards.create.placeholder);
  await expect(createInput).toBeFocused();

  // 2. Create the first board.
  await createInput.fill('Launch board');
  await createInput.press('Enter');
  await expect(page).toHaveURL(/\/boards\/.+/);
  await expect(page.getByText(messages.boards.toast.created)).toBeVisible();

  // 3. Verify the three default lists, Doing at WIP 3 (AC 14, 16).
  const toDo = page.getByRole('region', { name: 'To Do' });
  const doing = page.getByRole('region', { name: 'Doing' });
  const done = page.getByRole('region', { name: 'Done' });
  await expect(toDo).toBeVisible();
  await expect(doing).toBeVisible();
  await expect(done).toBeVisible();
  await expect(doing.locator('.board-list-column__pill')).toHaveText('0 / 3');

  // 4. Rename it.
  const title = page.getByLabel(messages.boards.title.label);
  await expect(title).toBeFocused();
  await title.fill(renamedTitle);
  await title.press('Enter');
  await expect(page.getByText(messages.boards.toast.renamed)).toBeVisible();

  // 5. Star it.
  await page.getByRole('button', { name: messages.boards.star }).click();
  await expect(page.getByText(messages.boards.toast.starred)).toBeVisible();
  await expect(page.getByRole('button', { name: messages.boards.unstar })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // 6. Sign out.
  await page.getByRole('button', { name: messages.shell.userMenu }).click();
  await page.getByRole('menuitem', { name: messages.auth.signOut }).click();
  await expect(page).toHaveURL(/\/login/);

  // 7. Log back in.
  await page.getByLabel(messages.auth.login.email).fill(user.email);
  const loginPassword = page.getByLabel(messages.auth.login.password, { exact: true });
  await loginPassword.fill(user.password);
  await loginPassword.press('Enter');

  // 8. The board is found first (starred, sorts to the top) with its new
  // name persisted across the sign-out/log-in round trip.
  await expect(page).toHaveURL(/\/boards\/.+/);
  const firstRowName = page.locator('.board-row__name').first();
  await expect(firstRowName).toHaveText(renamedTitle);
  await expect(page.locator('.board-row__star').first()).toBeVisible();
  await expect(page.getByLabel(messages.boards.title.label)).toHaveValue(renamedTitle);
  await expect(page.getByRole('button', { name: messages.boards.unstar })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const elapsedMs = Date.now() - start;
  const elapsedSeconds = elapsedMs / 1000;
  console.log(`MVP-1 slice elapsed: ${elapsedSeconds.toFixed(2)}s`);
  test.info().annotations.push({
    type: 'mvp1-elapsed-seconds',
    description: elapsedSeconds.toFixed(2),
  });

  // BM §1 / TAS-7 §6: the two-minute budget is asserted, not just logged.
  expect(elapsedMs).toBeLessThan(120_000);
});
