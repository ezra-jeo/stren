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

test('Google sign-in preview is honest and does not start OAuth', async ({ page }) => {
  await page.goto('/auth?mode=signin');
  await page.getByRole('button', { name: /continue with google.*coming soon/i }).click();
  await expect(page.getByRole('status')).toContainText('Google sign-in is coming soon.');
  await expect(page).toHaveURL(/\/auth\?mode=signin/);
});

test('password reset requests an email and preserves enumeration-safe copy', async ({ page }) => {
  await page.route('**/api/auth/password-reset', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        message: 'If an account exists for this email, we’ve sent password-reset instructions.',
      }),
    });
  });
  await page.goto('/reset-password');
  await page.getByLabel('Email address').fill('alex@example.com');
  await page.getByRole('button', { name: /send reset instructions/i }).click();
  await expect(page.getByRole('status')).toContainText(/if an account exists.*password-reset instructions/i);
});
