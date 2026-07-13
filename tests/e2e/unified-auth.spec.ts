import { expect, test } from '@playwright/test';

test('legacy auth URLs permanently redirect to unified routes', async ({ request }) => {
  const cases = [
    ['/gym/IRON/login', '/auth?mode=signin&gym=IRON'],
    ['/gym/IRON/signup', '/auth?mode=signup&gym=IRON'],
    ['/login', '/auth?mode=signin'],
    ['/signup', '/auth?mode=signup'],
    ['/signup/admin', '/for-gym-owners'],
    ['/signup/member', '/auth?mode=signup'],
    ['/gyms/new', '/for-gym-owners'],
    ['/register-gym', '/for-gym-owners'],
    ['/gym-select', '/gyms'],
    ['/kiosk/signup', '/kiosk'],
  ] as const;

  for (const [source, target] of cases) {
    const response = await request.get(source, { maxRedirects: 0 });
    expect(response.status(), source).toBe(308);
    expect(new URL(response.headers().location!, 'http://127.0.0.1:3000').pathname + new URL(response.headers().location!, 'http://127.0.0.1:3000').search).toBe(target);
  }
});

test('sign in and create account share one stateful auth surface', async ({ page }) => {
  await page.goto('/auth?mode=signin');
  await expect(page.getByRole('heading', { name: 'Welcome back', level: 1 })).toBeVisible();
  await expect(page.getByTestId('signup-pane')).toHaveAttribute('aria-hidden', 'true');

  await page.getByTestId('signin-pane').getByRole('button', { name: 'Create an account' }).click();
  await expect(page).toHaveURL(/\/auth\?mode=signup/);
  await expect(page.getByRole('heading', { name: 'Create your Stren account', level: 1 })).toBeVisible();
  await page.getByLabel('Full name').fill('Alex Rivera');

  await page.getByTestId('signup-pane').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\?mode=signin/);
  await expect(page.getByTestId('signup-pane')).toHaveAttribute('aria-hidden', 'true');

  await page.goBack();
  await expect(page).toHaveURL(/\/auth\?mode=signup/);
  await expect(page.getByLabel('Full name')).toHaveValue('Alex Rivera');
});
