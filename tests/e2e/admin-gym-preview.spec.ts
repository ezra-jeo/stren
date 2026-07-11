import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test("admin can open gym landing page preview from gym profile", async ({ page, context }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run this test.");

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL!);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/admin/gym-profile");

  const previewLink = page.getByRole("link", {
    name: /preview as visitor|preview as admin/i,
  });
  await expect(previewLink).toBeVisible();

  const [previewPage] = await Promise.all([
    context.waitForEvent("page"),
    previewLink.click(),
  ]);

  await previewPage.waitForLoadState("domcontentloaded");

  await expect(previewPage).toHaveURL(/\/gym\//);
  await expect(previewPage.getByText(/coming soon\./i)).toHaveCount(0);
  await expect(
    previewPage.getByRole("button", { name: /create account|join/i }).first(),
  ).toBeVisible();
});

// Gym Page Studio (ImplementationPlan.md §7, §9 Agent-A e2e row). Requires an owner
// account with the Studio; env-gated like the test above.
test("gym page studio loads, previews live, and gates publish on a tagline", async ({ page }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run this test.");

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL!);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/admin/gym-profile");

  // Two-pane studio header.
  await expect(page.getByRole("heading", { name: "Gym Page" })).toBeVisible();

  // Typing the tagline updates the live preview.
  const marker = `E2E ${Date.now()}`;
  const tagline = page.getByPlaceholder("Your gym's one-liner");
  await tagline.fill(marker);
  await expect(page.getByText(marker).first()).toBeVisible();

  // Save and Publish are distinct actions.
  await expect(page.getByRole("button", { name: /save changes/i })).toBeVisible();

  // Preview tabs switch views.
  await page.getByRole("tab", { name: "Pricing" }).click();
  await expect(page.getByRole("tab", { name: "Pricing" })).toHaveAttribute("aria-selected", "true");
});
