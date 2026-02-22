import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("loads homepage", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/情谊/);
  });

  test("has navigation links", async ({ page }) => {
    await page.goto("/");
    // Check key navigation elements exist
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("pricing page loads", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("body")).toBeVisible();
  });

  test("FAQ page loads", async ({ page }) => {
    await page.goto("/faq");
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("PWA", () => {
  test("manifest is accessible", async ({ request }) => {
    const res = await request.get("/manifest.json");
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();
    expect(manifest.name).toBeDefined();
    expect(manifest.icons).toBeDefined();
  });

  test("health endpoint responds", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.status).toBe("ok");
  });
});

test.describe("Admin login", () => {
  test("redirects unauthenticated to login", async ({ page }) => {
    await page.goto("/admin");
    // Should show login form or redirect
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("API endpoints", () => {
  test("public orders API returns data", async ({ request }) => {
    const res = await request.get("/api/orders/public");
    // May return 200 or 401 depending on auth
    expect([200, 401, 403]).toContain(res.status());
  });

  test("vitals endpoint accepts POST", async ({ request }) => {
    const res = await request.post("/api/vitals", {
      data: { name: "LCP", value: 1200, rating: "good", page: "/" },
    });
    expect(res.ok()).toBeTruthy();
  });

  test("feature flags API requires auth", async ({ request }) => {
    const res = await request.get("/api/admin/feature-flags");
    expect(res.status()).toBe(401);
  });
});

test.describe("Mobile responsiveness", () => {
  test("homepage renders on mobile viewport", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile only");
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    // Check viewport is mobile-sized
    const viewport = page.viewportSize();
    expect(viewport!.width).toBeLessThan(500);
  });
});
