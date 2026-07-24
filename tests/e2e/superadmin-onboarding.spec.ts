import { expect, test } from '@playwright/test';

const adminEmail = process.env.E2E_PLATFORM_ADMIN_EMAIL;
const adminPassword = process.env.E2E_PLATFORM_ADMIN_PASSWORD;
const runSuperadminE2E = process.env.E2E_RUN_SUPERADMIN === '1';

test.skip(!runSuperadminE2E, 'Set E2E_RUN_SUPERADMIN=1 only when the local seeded Supabase environment is available.');

test('unauthenticated operators are redirected away from Super Admin', async ({ request }) => {
  const response = await request.get('/superadmin', { maxRedirects: 0 });
  expect([307, 308]).toContain(response.status());
  const location = response.headers().location;
  expect(location).toMatch(/\/auth\?next=%2Fsuperadmin/);
});

test.describe('credentialed Assisted Onboarding journey', () => {
  test.skip(!adminEmail || !adminPassword, 'Set E2E_PLATFORM_ADMIN_EMAIL and E2E_PLATFORM_ADMIN_PASSWORD for seeded Super Admin E2E.');

  test('completes the four-step wizard through truthful invite delivery', async ({ page }) => {
    await page.goto('/auth?mode=signin&next=%2Fsuperadmin');
    await page.getByLabel('Email address').fill(adminEmail!);
    await page.getByLabel('Password').fill(adminPassword!);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/superadmin\/onboarding\/new/);
    await expect(page.getByRole('heading', { name: 'Assisted Onboarding' })).toBeVisible();

    await page.route('**/api/superadmin/onboarding/slug-check**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true, normalized: 'e2e-iron-fitness' }) });
    });
    await page.route('**/api/superadmin/onboarding/email-check**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ exists: false, ownsOrManagesGymCount: 0, pendingInvite: null }) });
    });
    await page.route('**/api/superadmin/onboarding/provision', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ gymId: 'e2e-gym', gymName: 'E2E Iron Fitness', gymCode: 'e2e-iron-fitness', ownerEmail: 'owner@example.com', expiresAt: '2030-01-01T00:00:00.000Z', deliveryStatus: 'sent' }),
      });
    });

    await page.getByLabel('Gym name').fill('E2E Iron Fitness');
    await page.getByLabel(/Full location/).fill('Quezon City');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Owner', level: 2 })).toBeVisible();

    await page.getByLabel('Full name').fill('E2E Owner');
    await page.getByLabel('Email address').fill('owner@example.com');
    await page.getByLabel('Philippine mobile number').fill('09171234567');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Membership plans', level: 2 })).toBeVisible();

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Review & Invite', level: 2 })).toBeVisible();
    await expect(page.getByText(/Private until the owner publishes/)).toBeVisible();
    await page.getByRole('button', { name: 'Finish setup' }).click();
    await expect(page.getByText('E2E Iron Fitness is ready')).toBeVisible();
    await expect(page.getByText('Pending owner claim')).toBeVisible();
    await expect(page.getByRole('button', { name: /Copy claim link/i })).toHaveCount(0);
  });
});
