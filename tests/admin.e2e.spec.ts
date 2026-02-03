import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'")) && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), "packages/app/.env.local"));

if (!process.env.ADMIN_DASH_TOKEN && !process.env.LEDGER_ADMIN_TOKEN) {
  process.env.ADMIN_DASH_TOKEN = "playwright-admin";
}
const adminToken = process.env.ADMIN_DASH_TOKEN || process.env.LEDGER_ADMIN_TOKEN || "";
const chainReady = Boolean(
  process.env.SUI_RPC_URL &&
    process.env.SUI_ADMIN_PRIVATE_KEY &&
    process.env.SUI_DAPP_HUB_ID &&
    process.env.SUI_DAPP_HUB_INITIAL_SHARED_VERSION
);

async function login(page: any) {
  await page.goto("/admin/login");
  await page.getByPlaceholder("请输入 ADMIN_DASH_TOKEN").fill(adminToken);
  const submit = page.getByRole("button", { name: "进入后台" });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const responsePromise = page.waitForResponse(
      (res: any) => res.url().includes("/api/admin/login") && res.request().method() === "POST"
    );
    await submit.click();
    const res = await responsePromise;
    if (res.ok()) {
      await page.waitForURL(/\/admin$/, { timeout: 10_000 });
      return;
    }
    const status = res.status();
    if (attempt === 0 && (status === 429 || status >= 500)) {
      await page.waitForTimeout(500);
      continue;
    }
    throw new Error(`Admin login failed with status ${status}`);
  }
  await page.waitForURL(/\/admin$/, { timeout: 10_000 });
}

test.describe.serial("admin ui e2e", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const profile = process.env.PW_PROFILE || "";
    if (profile && profile !== "admin") {
      test.skip(true, "Admin UI E2E only runs in PW_PROFILE=admin");
    }
    const projectName = testInfo.project.name;
    if (!projectName.includes("Desktop") && !projectName.includes("Admin E2E")) {
      test.skip(true, "Admin UI E2E runs only on desktop breakpoints");
    }
    if (!adminToken) {
      test.skip(true, "ADMIN_DASH_TOKEN or LEDGER_ADMIN_TOKEN missing");
    }
    await login(page);
    await expect(page.getByRole("heading", { name: "运营概览" })).toBeVisible();
  });

  test("dashboard loads", async ({ page }) => {
    const stats = page.locator(".admin-stat");
    await expect(stats).toHaveCount(4);
  });

  test("orders list and detail", async ({ page, request }) => {
    const orderId = `E2E-ORDER-${Date.now()}`;
    const playerName = `E2E-OPS-${Date.now()}`;
    await request.post("/api/admin/players", {
      data: {
        name: playerName,
        status: "可接单",
        depositBase: 2000,
        depositLocked: 2000,
        creditMultiplier: 1,
      },
      headers: adminToken ? { "x-admin-token": adminToken } : undefined,
    });
    await request.post("/api/orders", {
      data: {
        user: "E2E",
        item: `Admin E2E ${orderId}`,
        amount: 88,
        status: "已支付",
        orderId,
      },
    });

    const ordersLink = page.getByRole("link", { name: "订单调度" });
    await ordersLink.scrollIntoViewIfNeeded();
    await ordersLink.click();
    await expect(page.getByRole("heading", { name: "订单调度" })).toBeVisible();

    const search = page.getByPlaceholder("搜索用户 / 订单号 / 商品");
    await search.fill(orderId);
    await page.waitForTimeout(400);

    const row = page.locator("tr", { hasText: orderId });
    await expect(row).toBeVisible();
    const note = "Playwright admin E2E note";

    const waitPatch = () =>
      page.waitForResponse(
        (res) =>
          res.url().includes(`/api/admin/orders/${orderId}`) &&
          res.request().method() === "PATCH"
      );

    const assignSelect = row.getByRole("combobox", { name: "打手/客服" });
    const currentAssign = await assignSelect.inputValue();
    if (currentAssign) {
      const clearReq = waitPatch();
      await assignSelect.selectOption("");
      const res = await clearReq;
      if (!res.ok()) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(`清空派单失败: ${res.status()} ${JSON.stringify(payload)}`);
      }
    }

    const assignReq = waitPatch();
    await assignSelect.selectOption({ label: playerName });
    const assignRes = await assignReq;
    if (!assignRes.ok()) {
      const payload = await assignRes.json().catch(() => ({}));
      throw new Error(`派单失败: ${assignRes.status()} ${JSON.stringify(payload)}`);
    }

    const noteReq = waitPatch();
    await row.getByPlaceholder("备注").fill(note);
    await row.getByPlaceholder("备注").blur();
    const noteRes = await noteReq;
    if (!noteRes.ok()) {
      const payload = await noteRes.json().catch(() => ({}));
      throw new Error(`备注更新失败: ${noteRes.status()} ${JSON.stringify(payload)}`);
    }

    const stageSelect = row.getByRole("combobox", { name: "订单阶段" });
    const currentStage = await stageSelect.inputValue();
    if (currentStage !== "进行中") {
      const stageReq = waitPatch();
      await stageSelect.selectOption("进行中");
      const stageRes = await stageReq;
      if (!stageRes.ok()) {
        const payload = await stageRes.json().catch(() => ({}));
        throw new Error(`阶段更新失败: ${stageRes.status()} ${JSON.stringify(payload)}`);
      }
    }

    const detailLink = row.getByRole("link", { name: "查看" });
    await detailLink.click();
    const detailUrl = new RegExp(`/admin/orders/${orderId}$`);
    try {
      await page.waitForURL(detailUrl, { timeout: 8_000 });
    } catch {
      await page.goto(`/admin/orders/${orderId}`);
    }
    await expect(page.getByRole("heading", { name: "订单详情" })).toBeVisible();
    await expect(page.getByLabel("派单")).toHaveValue(playerName);
    await expect(page.getByLabel("备注")).toHaveValue(note);
    await expect(page.getByLabel("订单阶段")).toHaveValue("进行中");

    if (adminToken) {
      await request.delete(`/api/orders/${orderId}`, {
        headers: { "x-admin-token": adminToken },
      });
    }
  });

  test("players and announcements", async ({ page }) => {
    const playerName = `E2E玩家-${Date.now()}`;
    const playersLink = page.getByRole("link", { name: "打手管理" });
    await playersLink.scrollIntoViewIfNeeded();
    await playersLink.click();
    await expect(page.getByRole("heading", { name: "打手管理" })).toBeVisible();

    await page.getByPlaceholder("姓名 / 昵称").fill(playerName);
    await page.getByRole("button", { name: "添加打手" }).click();
    await expect(page.getByText(playerName)).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "删除" }).first().click();

    const title = `E2E公告-${Date.now()}`;
    const announcementsLink = page.getByRole("link", { name: "公告资讯" });
    await announcementsLink.scrollIntoViewIfNeeded();
    await announcementsLink.click();
    await expect(page.getByRole("heading", { name: "公告资讯" })).toBeVisible();

    await page.getByPlaceholder("公告标题").fill(title);
    await page.getByRole("button", { name: "发布公告" }).click();
    await expect(page.getByText(title)).toBeVisible();

    await page.getByRole("button", { name: "归档" }).first().click();
    await expect(page.locator("span.admin-badge", { hasText: "archived" }).first()).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "删除" }).first().click();
  });

  test("audit, payments, chain pages", async ({ page }) => {
    const paymentsLink = page.getByRole("link", { name: "支付事件" });
    await paymentsLink.scrollIntoViewIfNeeded();
    await paymentsLink.click();
    await expect(page.locator("h2.admin-title")).toHaveText("支付事件");

    const auditLink = page.getByRole("link", { name: "审计日志" });
    await auditLink.scrollIntoViewIfNeeded();
    await auditLink.click();
    await expect(page.locator("h2.admin-title")).toHaveText("审计日志");

    if (chainReady) {
      const chainLink = page.getByRole("link", { name: "链上对账" });
      await chainLink.scrollIntoViewIfNeeded();
      await chainLink.click();
      await expect(page.locator("h2.admin-title")).toHaveText("链上对账");
    }
  });
});
