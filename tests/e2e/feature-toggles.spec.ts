import { expect, test, type Page } from '@playwright/test';

const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? process.env.E2E_ADMIN_EMAIL;
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD;
const MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL;
const MEMBER_PASSWORD = process.env.E2E_MEMBER_PASSWORD;

async function signIn(page: Page, email: string, password: string, destination: RegExp) {
  await page.goto('/auth?mode=signin');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(destination);
}

async function saveStudio(page: Page) {
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('All changes saved')).toBeVisible();
}

test('owner can disable leaderboards and the member loses nav and direct-route access', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Run the shared-state feature-toggle journey once.');
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD || !MEMBER_EMAIL || !MEMBER_PASSWORD,
    'Set owner and member E2E credentials to run cross-role feature-toggle coverage.',
  );

  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();

  try {
    await signIn(ownerPage, OWNER_EMAIL!, OWNER_PASSWORD!, /\/admin$/);
    await ownerPage.goto('/admin/gym-profile');
    await ownerPage.getByRole('button', { name: /Features/ }).click();

    const leaderboard = ownerPage.getByRole('switch', { name: 'Show leaderboard to members' });
    await expect(leaderboard).toBeVisible();

    // Establish a known on baseline before exercising the off transition.
    if (await leaderboard.getAttribute('aria-checked') === 'false') {
      await leaderboard.click();
      await saveStudio(ownerPage);
    }

    await leaderboard.click();
    await saveStudio(ownerPage);

    await signIn(memberPage, MEMBER_EMAIL!, MEMBER_PASSWORD!, /\/member$/);
    await expect(memberPage.getByRole('link', { name: 'Ranks' })).toHaveCount(0);
    await memberPage.goto('/member/leaderboard');
    await expect(memberPage).toHaveURL(/\/member$/);
  } finally {
    // Leave the shared fixture gym in its catalog-default enabled state.
    if (await ownerPage.getByRole('switch', { name: 'Show leaderboard to members' }).count()) {
      const leaderboard = ownerPage.getByRole('switch', { name: 'Show leaderboard to members' });
      if (await leaderboard.getAttribute('aria-checked') === 'false') {
        await leaderboard.click();
        await saveStudio(ownerPage);
      }
    }
    await ownerContext.close();
    await memberContext.close();
  }
});
