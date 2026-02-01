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
  await page.getByRole("button", { name: "进入后台" }).click();
  await page.waitForURL(/\/admin$/);
}

test.describe.serial("admin ui e2e", () => {
  test.beforeEach(async ({ page }) => {
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
    await request.post("/api/orders", {
      data: {
        user: "E2E",
        item: `Admin E2E ${orderId}`,
        amount: 88,
        status: "已支付",
        orderId,
      },
    });

    await page.getByRole("link", { name: "订单调度" }).click();
    await expect(page.getByRole("heading", { name: "订单调度" })).toBeVisible();

    const search = page.getByPlaceholder("搜索用户 / 订单号 / 商品");
    await search.fill(orderId);
    await page.waitForTimeout(400);

    const row = page.locator("tr", { hasText: orderId });
    await expect(row).toBeVisible();
    const assignedTo = `E2E-OPS-${Date.now()}`;
    const note = "Playwright admin E2E note";

    const waitPatch = () =>
      page.waitForResponse(
        (res) =>
          res.url().includes(`/api/admin/orders/${orderId}`) &&
          res.request().method() === "PATCH" &&
          res.status() === 200
      );

    const assignReq = waitPatch();
    await row.getByPlaceholder("打手/客服").fill(assignedTo);
    await row.getByPlaceholder("打手/客服").blur();
    await assignReq;

    const noteReq = waitPatch();
    await row.getByPlaceholder("备注").fill(note);
    await row.getByPlaceholder("备注").blur();
    await noteReq;

    const stageReq = waitPatch();
    await row.getByRole("combobox").selectOption("进行中");
    await stageReq;

    await row.getByRole("link", { name: "查看" }).click();
    await expect(page.getByRole("heading", { name: "订单详情" })).toBeVisible();
    await expect(page.getByLabel("派单")).toHaveValue(assignedTo);
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
    await page.getByRole("link", { name: "打手管理" }).click();
    await expect(page.getByRole("heading", { name: "打手管理" })).toBeVisible();

    await page.getByPlaceholder("姓名 / 昵称").fill(playerName);
    await page.getByRole("button", { name: "添加打手" }).click();
    await expect(page.getByText(playerName)).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "删除" }).first().click();

    const title = `E2E公告-${Date.now()}`;
    await page.getByRole("link", { name: "公告资讯" }).click();
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
    await page.getByRole("link", { name: "支付事件" }).click();
    await expect(page.locator("h2.admin-title")).toHaveText("支付事件");

    await page.getByRole("link", { name: "审计日志" }).click();
    await expect(page.locator("h2.admin-title")).toHaveText("审计日志");

    if (chainReady) {
      await page.getByRole("link", { name: "链上对账" }).click();
      await expect(page.locator("h2.admin-title")).toHaveText("链上对账");
    }
  });
});
