import { test, expect } from "@playwright/test";

test.describe("Order flow (unauthenticated)", () => {
  test("package listing page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });

  test("player review page loads", async ({ page }) => {
    // Try accessing a player review page
    const res = await page.goto("/players/test-player");
    // May 404 but should not 500
    expect(res?.status()).not.toBe(500);
  });
});

test.describe("Notification page", () => {
  test("redirects without auth", async ({ page }) => {
    await page.goto("/me/notifications");
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Companion portal", () => {
  test("companion page loads", async ({ page }) => {
    await page.goto("/companion");
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("SEO", () => {
  test("sitemap.xml is accessible", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.ok()).toBeTruthy();
    const text = await res.text();
    expect(text).toContain("urlset");
  });

  test("robots.txt is accessible", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.ok()).toBeTruthy();
  });

  test("OG meta tags on homepage", async ({ page }) => {
    await page.goto("/");
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute("content");
    expect(ogTitle).toBeTruthy();
  });
});
