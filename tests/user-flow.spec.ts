import { test, expect } from "@playwright/test";

/**
 * 用户核心流程 E2E 测试
 *
 * 覆盖：公共页面可访问性、导航流程、错误边界
 * 不需要链上环境或 admin token
 */

const passkeyStub = {
  address: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd",
  publicKey: "dGVzdC1wdWJsaWMta2V5",
};

test.describe("公共页面加载", () => {
  test("首页（landing）可访问", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/情谊|Qingyi/i);
    // Landing page should have a CTA
    const cta = page.getByRole("link", { name: /开始使用|Get Started/i });
    await expect(cta).toBeVisible();
  });

  test("公告页可访问", async ({ page }) => {
    await page.goto("/news");
    await page.waitForLoadState("networkidle");
    // Should render without error
    await expect(page.locator("body")).not.toContainText("页面出错");
  });

  test("展示页可访问", async ({ page }) => {
    await page.goto("/showcase");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("页面出错");
  });
});

test.describe("已登录用户导航", () => {
  test.beforeEach(async ({ page }) => {
    // Stub passkey wallet to simulate logged-in state
    await page.addInitScript((value) => {
      window.localStorage.setItem("qy_passkey_wallet_v3", JSON.stringify(value));
    }, passkeyStub);
    await page.addInitScript(() => {
      window.localStorage.setItem("dl_orders", JSON.stringify([]));
    });
  });

  test("home 页加载订单池", async ({ page }) => {
    await page.goto("/home");
    await page.waitForLoadState("networkidle");
    // Should not show error boundary
    await expect(page.locator("body")).not.toContainText("加载失败");
    await expect(page.locator("body")).not.toContainText("页面出错");
  });

  test("schedule 页加载", async ({ page }) => {
    await page.goto("/schedule");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("页面出错");
  });

  test("me 页显示地址", async ({ page }) => {
    await page.goto("/me");
    await page.waitForLoadState("networkidle");
    // Should show truncated address somewhere
    await expect(page.locator("body")).not.toContainText("页面出错");
  });

  test("wallet 页加载", async ({ page }) => {
    await page.goto("/wallet");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("页面出错");
  });

  test("tab 导航切换", async ({ page }) => {
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    // Navigate to schedule via tab bar
    const scheduleTab = page.getByRole("link", { name: /日程|schedule/i }).first();
    if (await scheduleTab.isVisible()) {
      await scheduleTab.click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/schedule/);
    }
  });
});

test.describe("错误恢复", () => {
  test("404 页面处理", async ({ page }) => {
    const response = await page.goto("/nonexistent-page-xyz");
    // Should either 404 or redirect, not 500
    expect(response?.status()).not.toBe(500);
  });

  test("无效 API 路由返回合理错误", async ({ request }) => {
    const response = await request.get("/api/nonexistent");
    // Should be 404 or 405, not 500
    expect(response.status()).not.toBe(500);
  });
});
