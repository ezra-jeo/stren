import { expect, test } from "@playwright/test";

test("home redirects to landing", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/landing$/);
  await expect(page.getByRole("heading", { name: /your gym\. your rules\./i })).toBeVisible();
});

test("landing exposes core CTAs", async ({ page }) => {
  await page.goto("/landing");

  await expect(page.getByRole("link", { name: /^sign in$/i }).first()).toHaveAttribute("href", "/auth?mode=signin");
  await expect(page.getByRole("link", { name: /^create account$/i }).first()).toHaveAttribute("href", "/auth?mode=signup");
  await expect(page.getByRole("link", { name: /^for gym owners$/i }).first()).toHaveAttribute("href", "/for-gym-owners");
  
  // Open the navigation menu to access Sign In and Create Account
  await page.getByRole("button", { name: /open menu/i }).click();
  
  // Use the menu panel locator for scoped selections
  const menuPanel = page.locator("#nav-menu-panel");
  await expect(menuPanel.getByRole("link", { name: /sign in/i })).toBeVisible();
  await expect(menuPanel.getByRole("link", { name: /create account/i })).toBeVisible();
  await expect(menuPanel.getByRole("link", { name: /bring stren to your gym/i })).toHaveAttribute("href", "/for-gym-owners");
  
  // Close menu using the X button (not the backdrop overlay)
  await menuPanel.locator("button[aria-label='Close menu']").click();
  
  // Check gym finder search is visible
  await expect(page.getByPlaceholder(/search by gym name or code/i)).toBeVisible();
});
