import fs from "node:fs";
import crypto from "node:crypto";
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

async function login(page: any, tokenOverride?: string) {
  const tokenToUse = tokenOverride ?? adminToken;
  await page.goto("/admin/login");
  await page.getByPlaceholder("请输入 ADMIN_DASH_TOKEN").fill(tokenToUse);
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

async function safeAdminDelete(request: any, url: string, headers?: Record<string, string>) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await request.delete(url, { headers });
      if (res.ok()) return true;
      return false;
    } catch {
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
      return false;
    }
  }
  return false;
}

type AdminRole = "admin" | "finance" | "ops" | "viewer";

const ROLE_ORDER: AdminRole[] = ["viewer", "ops", "finance", "admin"];
const ROLE_SET = new Set(ROLE_ORDER);

const NAV_ITEMS: Array<{ href: string; label: string; minRole: AdminRole }> = [
  { href: "/admin", label: "运营概览", minRole: "viewer" },
  { href: "/admin/orders", label: "订单调度", minRole: "viewer" },
  { href: "/admin/support", label: "客服工单", minRole: "ops" },
  { href: "/admin/coupons", label: "优惠卡券", minRole: "ops" },
  { href: "/admin/vip", label: "会员管理", minRole: "ops" },
  { href: "/admin/players", label: "打手管理", minRole: "viewer" },
  { href: "/admin/guardians", label: "护航申请", minRole: "ops" },
  { href: "/admin/announcements", label: "公告资讯", minRole: "viewer" },
  { href: "/admin/analytics", label: "增长数据", minRole: "admin" },
  { href: "/admin/ledger", label: "记账中心", minRole: "finance" },
  { href: "/admin/mantou", label: "馒头提现", minRole: "finance" },
  { href: "/admin/invoices", label: "发票申请", minRole: "finance" },
  { href: "/admin/chain", label: "订单对账", minRole: "finance" },
  { href: "/admin/payments", label: "支付事件", minRole: "finance" },
  { href: "/admin/tokens", label: "密钥管理", minRole: "admin" },
  { href: "/admin/audit", label: "审计日志", minRole: "admin" },
];

function roleRank(role: AdminRole): number {
  switch (role) {
    case "admin":
      return 4;
    case "finance":
      return 3;
    case "ops":
      return 2;
    default:
      return 1;
  }
}

function canAccess(role: AdminRole, minRole: AdminRole) {
  return roleRank(role) >= roleRank(minRole);
}

function parseAdminRoleTokens(): Partial<Record<AdminRole, string>> {
  const tokens: Partial<Record<AdminRole, string>> = {};
  const assignToken = (role: AdminRole, token?: string) => {
    if (!token || !ROLE_SET.has(role) || tokens[role]) return;
    tokens[role] = token;
  };

  const json = process.env.ADMIN_TOKENS_JSON;
  if (json) {
    try {
      const parsed = JSON.parse(json) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || typeof item !== "object") continue;
          const role = (item as { role?: AdminRole }).role;
          const token = (item as { token?: string }).token;
          if (role && ROLE_SET.has(role) && token) {
            assignToken(role, token);
          }
        }
      } else if (parsed && typeof parsed === "object") {
        for (const [roleKey, value] of Object.entries(parsed as Record<string, unknown>)) {
          const role = roleKey as AdminRole;
          if (typeof value === "string") {
            assignToken(role, value);
          } else if (Array.isArray(value)) {
            for (const token of value) {
              if (typeof token === "string") {
                assignToken(role, token);
              }
            }
          }
        }
      }
    } catch {
      // ignore invalid JSON
    }
  }

  const raw = process.env.ADMIN_TOKENS;
  if (raw) {
    for (const segment of raw.split(/[;,]/)) {
      const trimmed = segment.trim();
      if (!trimmed) continue;
      const [roleRaw, token] = trimmed.split(":").map((part) => part.trim());
      if (!roleRaw || !token) continue;
      if (!ROLE_SET.has(roleRaw as AdminRole)) continue;
      assignToken(roleRaw as AdminRole, token);
    }
  }

  const adminFallback = process.env.ADMIN_DASH_TOKEN;
  if (adminFallback) assignToken("admin", adminFallback);
  const ledgerToken = process.env.LEDGER_ADMIN_TOKEN;
  if (ledgerToken) {
    const role: AdminRole = adminFallback ? "finance" : "admin";
    assignToken(role, ledgerToken);
  }

  return tokens;
}

let ROLE_TOKENS = parseAdminRoleTokens();
const CREATED_TOKEN_IDS: string[] = [];

if (!ROLE_TOKENS.admin && adminToken) {
  ROLE_TOKENS.admin = adminToken;
}

async function createRoleToken(request: any, role: AdminRole) {
  if (!adminHeaders) return null;
  const res = await request.post("/api/admin/tokens", {
    data: { role, label: `E2E-${role}` },
    headers: adminHeaders,
  });
  if (!res.ok) return null;
  const payload = await res.json().catch(() => ({}));
  const token = typeof payload?.token === "string" ? payload.token : "";
  if (token) {
    ROLE_TOKENS = { ...ROLE_TOKENS, [role]: token };
  }
  const id = payload?.item?.id;
  if (typeof id === "string") {
    CREATED_TOKEN_IDS.push(id);
  }
  return token || null;
}

async function ensureRoleTokens(request: any) {
  const missing = ROLE_ORDER.filter((role) => !ROLE_TOKENS[role]);
  if (missing.length === 0) return;
  if (!adminHeaders) return;
  for (const role of missing) {
    await createRoleToken(request, role);
  }
}

async function cleanupRoleTokens(request: any) {
  if (!adminHeaders) return;
  for (const tokenId of CREATED_TOKEN_IDS) {
    await request.delete(`/api/admin/tokens/${tokenId}`, { headers: adminHeaders });
  }
}

async function expectNavVisibility(page: any, role: AdminRole) {
  for (const item of NAV_ITEMS) {
    const locator = page.getByRole("link", { name: item.label });
    if (canAccess(role, item.minRole)) {
      await expect(locator.first()).toBeVisible();
    } else {
      await expect(locator).toHaveCount(0);
    }
  }
}

async function expectAccessDenied(page: any, href: string) {
  try {
    await page.goto(href);
  } catch {
    // navigation can be aborted by client-side redirect
  }
  const fallbackRegex = /\/admin\/?$/;
  const redirected = await page
    .waitForURL(fallbackRegex, { timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  if (redirected) return;
  await expect(page.getByText("无权限访问该页面")).toBeVisible();
}

async function expectViewerReadOnly(page: any) {
  await page.goto("/admin/orders");
  await expect(page.getByRole("heading", { name: "订单筛选" })).toBeVisible();
  await expect(page.locator(".admin-badge", { hasText: "只读权限" }).first()).toBeVisible();
  await page.goto("/admin/players");
  await expect(page.getByRole("heading", { name: "打手列表" })).toBeVisible();
  await expect(page.getByText("当前账号无法新增或编辑打手")).toBeVisible();
  await page.goto("/admin/announcements");
  await expect(page.getByRole("heading", { name: "公告列表" })).toBeVisible();
  await expect(page.getByText("当前账号无法编辑公告内容")).toBeVisible();
}

test.describe("admin suite", () => {
  test.describe.configure({ mode: "serial" });

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
    const playerAddress = `0x${crypto.randomBytes(32).toString("hex")}`;
    const playerRes = await request.post("/api/admin/players", {
      data: {
        name: playerName,
        status: "可接单",
        address: playerAddress,
        depositBase: 2000,
        depositLocked: 2000,
        creditMultiplier: 1,
      },
      headers: adminHeaders,
    });
    const playerPayload = await playerRes.json().catch(() => ({}));
    const playerId = typeof playerPayload?.id === "string" ? playerPayload.id : "";
    await request.post("/api/admin/orders", {
      data: {
        id: orderId,
        user: "E2E",
        item: `Admin E2E ${orderId}`,
        amount: 88,
        paymentStatus: "已支付",
        stage: "待处理",
        source: "e2e",
      },
      headers: adminHeaders,
    });

    const ordersLink = page.getByRole("link", { name: "订单调度" });
    await ordersLink.scrollIntoViewIfNeeded();
    await ordersLink.click();
    await expect(page).toHaveURL(/\/admin\/orders/);
    await expect(page.getByRole("heading", { name: "订单筛选" })).toBeVisible();

    const search = page.getByPlaceholder("搜索用户 / 订单号 / 商品");
    await search.fill(orderId);
    await page.waitForTimeout(400);

    const row = page.locator("tr", { hasText: orderId });
    await expect(row).toBeVisible();
    const note = "Playwright admin E2E note";

    const assignSelect = row.getByRole("combobox", { name: "打手/客服" });
    await expect(assignSelect).toBeEnabled();
    const currentAssign = await assignSelect.inputValue();
    if (currentAssign && currentAssign !== playerId) {
      await assignSelect.selectOption("");
      await expect(assignSelect).toHaveValue("");
    }
    if (currentAssign !== playerId) {
      await assignSelect.selectOption(playerId || { label: playerName });
      await expect(assignSelect).toHaveValue(playerId);
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
      await request.delete(`/api/admin/orders/${orderId}`, { headers: adminHeaders });
    }
  });

  test("players and announcements", async ({ page, request }) => {
    const playerName = `E2E玩家-${Date.now()}`;
    const playerAddress = `0x${crypto.randomBytes(32).toString("hex")}`;
    const createPlayerRes = await request.post("/api/admin/players", {
      data: { name: playerName, address: playerAddress, status: "可接单", creditMultiplier: 1 },
      headers: adminHeaders,
    });
    if (!createPlayerRes.ok()) {
      const payload = await createPlayerRes.json().catch(() => ({}));
      throw new Error(`创建打手失败: ${createPlayerRes.status()} ${JSON.stringify(payload)}`);
    }
    const playerPayload = await createPlayerRes.json().catch(() => ({}));
    const playerId = typeof playerPayload?.id === "string" ? playerPayload.id : "";
    if (!playerId) {
      throw new Error("创建打手失败: 返回缺少 ID");
    }

    const loadPlayersRes = waitForAdminResponse(page, "/api/admin/players", "GET");
    await page.goto("/admin/players");
    await loadPlayersRes;
    await expect(page.getByRole("heading", { name: "打手列表" })).toBeVisible();

    const playerRow = page.locator("tr", { hasText: playerName });
    await expect(playerRow).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    const deleteRes = waitForAdminResponse(page, `/api/admin/players/${playerId}`, "DELETE");
    await playerRow.getByRole("button", { name: "删除" }).click();
    const deleteResp = await deleteRes;
    if (!deleteResp.ok()) {
      const payload = await deleteResp.json().catch(() => ({}));
      throw new Error(`删除打手失败: ${deleteResp.status()} ${JSON.stringify(payload)}`);
    }

    const title = `E2E公告-${Date.now()}`;
    const createAnnRes = await request.post("/api/admin/announcements", {
      data: { title, tag: "公告", status: "draft", content: "" },
      headers: adminHeaders,
    });
    const annPayload = await createAnnRes.json().catch(() => ({}));
    if (!createAnnRes.ok()) {
      throw new Error(`创建公告失败: ${createAnnRes.status()} ${JSON.stringify(annPayload)}`);
    }
    const annId = typeof annPayload?.id === "string" ? annPayload.id : "";
    if (!annId) {
      throw new Error("创建公告失败: 返回缺少 ID");
    }
    const loadAnnRes = waitForAdminResponse(page, "/api/admin/announcements", "GET");
    await page.goto("/admin/announcements");
    await loadAnnRes;
    await expect(page.getByRole("heading", { name: "公告列表" })).toBeVisible();

    const annCard = page.locator(".admin-card--subtle", { hasText: title });
    await expect(annCard).toBeVisible();

    const archiveRes = waitForAdminResponse(page, `/api/admin/announcements/${annId}`, "PATCH");
    await annCard.getByRole("button", { name: "归档" }).click();
    const archiveResp = await archiveRes;
    if (!archiveResp.ok()) {
      const payload = await archiveResp.json().catch(() => ({}));
      throw new Error(`归档公告失败: ${archiveResp.status()} ${JSON.stringify(payload)}`);
    }
    await expect(annCard.locator("span.admin-badge", { hasText: "archived" })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    const deleteAnnRes = waitForAdminResponse(page, `/api/admin/announcements/${annId}`, "DELETE");
    await annCard.getByRole("button", { name: "删除" }).click();
    const deleteAnnResp = await deleteAnnRes;
    if (!deleteAnnResp.ok()) {
      const payload = await deleteAnnResp.json().catch(() => ({}));
      throw new Error(`删除公告失败: ${deleteAnnResp.status()} ${JSON.stringify(payload)}`);
    }
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
    await page.goto("/admin/coupons");
    await expect(page.getByRole("heading", { name: "优惠券列表" })).toBeVisible();
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
    await page.goto("/admin/invoices");
    await expect(page.getByRole("heading", { name: "发票申请列表" })).toBeVisible();
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
    await page.goto("/admin/support");
    await expect(page.getByRole("heading", { name: "工单列表" })).toBeVisible();
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
    await page.goto("/admin/guardians");
    await expect(page.getByRole("heading", { name: "护航申请列表" })).toBeVisible();
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
    await page.goto("/admin/vip");
    await expect(page.getByRole("heading", { name: "会员列表" })).toBeVisible();
    await expect(page.getByRole("cell", { name: tierName, exact: true }).first()).toBeVisible();
    await expect(page.getByText(member.userName || "E2E会员").first()).toBeVisible();
    if (adminToken) {
      await safeAdminDelete(request, `/api/admin/vip/members/${member.id}`, adminHeaders);
      await safeAdminDelete(request, `/api/admin/vip/tiers/${tier.id}`, adminHeaders);
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
    await page.goto("/admin/mantou");
    await expect(page.getByRole("heading", { name: "提现申请列表" })).toBeVisible();
    await expect(page.getByText(address.slice(0, 10))).toBeVisible();
    if (adminToken && requestId) {
      await request.patch(`/api/admin/mantou/withdraws/${requestId}`, {
        data: { status: "已拒绝", note: "e2e cleanup" },
        headers: adminHeaders,
      });
    }
  });

  test("audit, payments, chain pages", async ({ page }) => {
    await page.goto("/admin/payments");
    await expect(page.getByRole("heading", { name: "支付事件" })).toBeVisible();

    await page.goto("/admin/ledger");
    await expect(page.getByRole("heading", { name: "记账登记" })).toBeVisible();

    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { name: "审计日志" })).toBeVisible();

    if (chainReady) {
      await page.goto("/admin/chain");
      await expect(page.getByRole("heading", { name: "订单对账" })).toBeVisible();
    }
  });
});

test.describe("admin role access", () => {
  test.describe.configure({ mode: "serial", timeout: 90_000 });

  test.beforeAll(async ({ request }) => {
    await ensureRoleTokens(request);
  });

  test.afterAll(async ({ request }) => {
    await cleanupRoleTokens(request);
  });

  for (const role of ROLE_ORDER) {
    test.describe(`${role} role`, () => {
      test.beforeEach(async ({ page }, testInfo) => {
        const profile = process.env.PW_PROFILE || "";
        if (profile && profile !== "admin") {
          test.skip(true, "Role access checks run only in PW_PROFILE=admin");
        }
        const projectName = testInfo.project.name;
        if (!projectName.includes("Desktop") && !projectName.includes("Admin E2E")) {
          test.skip(true, "Role access checks run only on desktop breakpoints");
        }
        const token = ROLE_TOKENS[role];
        if (!token) {
          test.skip(true, `缺少 ${role} 角色 token，请在 .env.local 配置或通过密钥管理生成`);
        }
        await login(page, token);
        await expect(page.getByRole("heading", { name: "运营概览" })).toBeVisible();
      });

      test("nav visibility", async ({ page }) => {
        await expectNavVisibility(page, role);
      });

      test("restricted pages redirect", async ({ page }) => {
        const restricted = NAV_ITEMS.filter((item) => !canAccess(role, item.minRole));
        if (restricted.length === 0) {
          test.skip(true, "当前角色无受限页面");
        }
        for (const item of restricted) {
          await expectAccessDenied(page, item.href);
        }
      });

      test("ops pages readonly for viewer", async ({ page }) => {
        if (roleRank(role) >= roleRank("ops")) {
          test.skip(true, "当前角色具备编辑权限");
        }
        await expectViewerReadOnly(page);
      });
    });
  }
});
});
