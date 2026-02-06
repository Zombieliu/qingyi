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
const adminHeaders = adminToken ? { "x-admin-token": adminToken } : undefined;
const mantouEnabled = process.env.E2E_MANTOU_WITHDRAW === "1";
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

async function waitForAdminResponse(page: any, urlPart: string, method: string) {
  return page.waitForResponse(
    (res: any) => res.url().includes(urlPart) && res.request().method() === method
  );
}

test.describe("admin ui e2e", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });
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
      headers: adminHeaders,
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

    const updateRes = await request.patch(`/api/admin/orders/${orderId}`, {
      data: { note, stage: "进行中" },
      headers: adminHeaders,
    });
    if (!updateRes.ok()) {
      const payload = await updateRes.json().catch(() => ({}));
      throw new Error(`订单更新失败: ${updateRes.status()} ${JSON.stringify(payload)}`);
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
        headers: adminHeaders,
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
    const deleteRes = waitForAdminResponse(page, "/api/admin/players/", "DELETE");
    await page.getByRole("button", { name: "删除" }).first().click();
    const deleteResp = await deleteRes;
    if (!deleteResp.ok()) {
      const payload = await deleteResp.json().catch(() => ({}));
      throw new Error(`删除打手失败: ${deleteResp.status()} ${JSON.stringify(payload)}`);
    }

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

  test("coupons", async ({ page, request }) => {
    const couponTitle = `E2E券-${Date.now()}`;
    const createRes = await request.post("/api/admin/coupons", {
      data: { title: couponTitle, discount: 20, status: "可用" },
      headers: adminHeaders,
    });
    if (!createRes.ok()) {
      const payload = await createRes.json().catch(() => ({}));
      throw new Error(`创建优惠券失败: ${createRes.status()} ${JSON.stringify(payload)}`);
    }
    const coupon = await createRes.json();
    const couponsLink = page.getByRole("link", { name: "优惠卡券" });
    await couponsLink.scrollIntoViewIfNeeded();
    await couponsLink.click();
    await expect(page.getByRole("heading", { name: "优惠卡券" })).toBeVisible();
    await page.getByPlaceholder("搜索标题 / 兑换码").fill(couponTitle);
    await page.waitForTimeout(400);
    await expect(page.getByText(couponTitle)).toBeVisible();
    if (adminToken) {
      await request.delete(`/api/admin/coupons/${coupon.id}`, { headers: adminHeaders });
    }
  });

  test("invoices", async ({ page, request }) => {
    const invoiceTitle = `E2E抬头-${Date.now()}`;
    const createRes = await request.post("/api/admin/invoices", {
      data: { title: invoiceTitle, amount: 88, status: "待审核" },
      headers: adminHeaders,
    });
    if (!createRes.ok()) {
      const payload = await createRes.json().catch(() => ({}));
      throw new Error(`创建发票失败: ${createRes.status()} ${JSON.stringify(payload)}`);
    }
    const invoice = await createRes.json();
    const invoicesLink = page.getByRole("link", { name: "发票申请" });
    await invoicesLink.scrollIntoViewIfNeeded();
    await invoicesLink.click();
    await expect(page.getByRole("heading", { name: "发票申请" })).toBeVisible();
    await page.getByPlaceholder("搜索抬头 / 税号 / 订单号").fill(invoiceTitle);
    await page.waitForTimeout(400);
    const row = page.locator("tr", { hasText: invoiceTitle });
    await expect(row).toBeVisible();
    const statusSelect = row.getByRole("combobox").first();
    const updateRes = waitForAdminResponse(page, `/api/admin/invoices/${invoice.id}`, "PATCH");
    await statusSelect.selectOption("已开票");
    const statusResp = await updateRes;
    if (!statusResp.ok()) {
      const payload = await statusResp.json().catch(() => ({}));
      throw new Error(`更新发票状态失败: ${statusResp.status()} ${JSON.stringify(payload)}`);
    }
    if (adminToken) {
      await request.delete(`/api/admin/invoices/${invoice.id}`, { headers: adminHeaders });
    }
  });

  test("support and guardians", async ({ page, request }) => {
    const ticketMessage = `E2E工单-${Date.now()}`;
    const ticketRes = await request.post("/api/admin/support", {
      data: { message: ticketMessage, userName: "E2E用户", status: "待处理" },
      headers: adminHeaders,
    });
    if (!ticketRes.ok()) {
      const payload = await ticketRes.json().catch(() => ({}));
      throw new Error(`创建工单失败: ${ticketRes.status()} ${JSON.stringify(payload)}`);
    }
    const ticket = await ticketRes.json();
    const supportLink = page.getByRole("link", { name: "客服工单" });
    await supportLink.scrollIntoViewIfNeeded();
    await supportLink.click();
    await expect(page.getByRole("heading", { name: "客服工单" })).toBeVisible();
    await page.getByPlaceholder("搜索联系人 / 主题 / 内容").fill(ticketMessage);
    await page.waitForTimeout(400);
    const ticketRow = page.locator("tr", { hasText: ticketMessage });
    await expect(ticketRow).toBeVisible();
    await request.delete(`/api/admin/support/${ticket.id}`, { headers: adminHeaders });

    const guardianName = `E2E护航-${Date.now()}`;
    const guardianRes = await request.post("/api/admin/guardians", {
      data: { user: guardianName, contact: "test-wechat", status: "待审核" },
      headers: adminHeaders,
    });
    if (!guardianRes.ok()) {
      const payload = await guardianRes.json().catch(() => ({}));
      throw new Error(`创建护航失败: ${guardianRes.status()} ${JSON.stringify(payload)}`);
    }
    const guardian = await guardianRes.json();
    const guardiansLink = page.getByRole("link", { name: "护航申请" });
    await guardiansLink.scrollIntoViewIfNeeded();
    await guardiansLink.click();
    await expect(page.getByRole("heading", { name: "护航申请" })).toBeVisible();
    await page.getByPlaceholder("搜索姓名 / 游戏 / 联系方式").fill(guardianName);
    await page.waitForTimeout(400);
    await expect(page.getByText(guardianName)).toBeVisible();
    await request.delete(`/api/admin/guardians/${guardian.id}`, { headers: adminHeaders });
  });

  test("vip management", async ({ page, request }) => {
    const tierName = `E2E-VIP-${Date.now()}`;
    const tierRes = await request.post("/api/admin/vip/tiers", {
      data: { name: tierName, level: 9, price: 199, status: "上架" },
      headers: adminHeaders,
    });
    if (!tierRes.ok()) {
      const payload = await tierRes.json().catch(() => ({}));
      throw new Error(`创建会员等级失败: ${tierRes.status()} ${JSON.stringify(payload)}`);
    }
    const tier = await tierRes.json();
    const memberRes = await request.post("/api/admin/vip/members", {
      data: { userName: "E2E会员", tierId: tier.id, tierName: tier.name, status: "待开通" },
      headers: adminHeaders,
    });
    if (!memberRes.ok()) {
      const payload = await memberRes.json().catch(() => ({}));
      throw new Error(`创建会员失败: ${memberRes.status()} ${JSON.stringify(payload)}`);
    }
    const member = await memberRes.json();
    const vipLink = page.getByRole("link", { name: "会员管理" });
    await vipLink.scrollIntoViewIfNeeded();
    await vipLink.click();
    await expect(page.getByRole("heading", { name: "会员管理" })).toBeVisible();
    await expect(page.getByRole("cell", { name: tierName, exact: true }).first()).toBeVisible();
    await expect(page.getByText(member.userName || "E2E会员").first()).toBeVisible();
    if (adminToken) {
      await request.delete(`/api/admin/vip/members/${member.id}`, { headers: adminHeaders });
      await request.delete(`/api/admin/vip/tiers/${tier.id}`, { headers: adminHeaders });
    }
  });

  test("mantou withdraw list", async ({ page, request }) => {
    if (!mantouEnabled) {
      test.skip(true, "E2E_MANTOU_WITHDRAW=1 to run mantou withdraw test");
    }
    const address = process.env.NEXT_PUBLIC_QY_DEFAULT_COMPANION || "";
    if (!address) {
      test.skip(true, "NEXT_PUBLIC_QY_DEFAULT_COMPANION missing");
    }
    if (adminToken) {
      await request.post("/api/mantou/seed", {
        data: { address, amount: 1, note: "e2e mantou seed" },
        headers: adminHeaders,
      });
    }
    const withdrawRes = await request.post("/api/mantou/withdraw", {
      data: { address, amount: 1, account: "e2e-account" },
    });
    if (!withdrawRes.ok()) {
      const payload = await withdrawRes.json().catch(() => ({}));
      throw new Error(`创建提现失败: ${withdrawRes.status()} ${JSON.stringify(payload)}`);
    }
    const withdrawPayload = await withdrawRes.json().catch(() => ({}));
    const requestId = withdrawPayload?.request?.id as string | undefined;
    const mantouLink = page.getByRole("link", { name: "馒头提现" });
    await mantouLink.scrollIntoViewIfNeeded();
    await mantouLink.click();
    await expect(page.getByRole("heading", { name: "馒头提现" })).toBeVisible();
    await expect(page.getByText(address.slice(0, 10))).toBeVisible();
    if (adminToken && requestId) {
      await request.patch(`/api/admin/mantou/withdraws/${requestId}`, {
        data: { status: "已拒绝", note: "e2e cleanup" },
        headers: adminHeaders,
      });
    }
  });

  test("audit, payments, chain pages", async ({ page }) => {
    const paymentsLink = page.getByRole("link", { name: "支付事件" });
    await paymentsLink.scrollIntoViewIfNeeded();
    await paymentsLink.click();
    await expect(page.locator("h2.admin-title")).toHaveText("支付事件");

    const ledgerLink = page.getByRole("link", { name: "记账中心" });
    await ledgerLink.scrollIntoViewIfNeeded();
    await ledgerLink.click();
    await expect(page.locator("h2.admin-title")).toHaveText("记账中心");

    const auditLink = page.getByRole("link", { name: "审计日志" });
    await auditLink.scrollIntoViewIfNeeded();
    await auditLink.click();
    await expect(page.locator("h2.admin-title")).toHaveText("审计日志");

    if (chainReady) {
      const chainLink = page.getByRole("link", { name: "订单对账" });
      await chainLink.scrollIntoViewIfNeeded();
      await chainLink.click();
      await expect(page.locator("h2.admin-title")).toHaveText("订单对账");
    }
  });
});
