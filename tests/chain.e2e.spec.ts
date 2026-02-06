import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { getFaucetHost, requestSuiFromFaucetV1 } from "@mysten/sui/faucet";
import { ensureChainEnvLoaded, waitForOrderStatus, creditBalanceOnChain, getRpcLogs, resetRpcLogs } from "./helpers/chain";
import { normalizeSuiAddress, SUI_ADDRESS_LENGTH } from "@mysten/sui/utils";
import { blake2b } from "@noble/hashes/blake2b";
import { bytesToHex } from "@noble/hashes/utils";
import { secp256r1 } from "@noble/curves/p256";
import { PasskeyPublicKey } from "@mysten/sui/keypairs/passkey";
import { fetchChainOrders } from "../packages/app/src/lib/qy-chain";

const MIN_GAS = BigInt(process.env.E2E_MIN_GAS || "50000000"); // default 0.05 SUI
const PASSKEY_FLAG = 0x06;
const SECP256R1_SPKI_HEADER = new Uint8Array([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86,
  0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
]);

const e2eLogs: string[] = [];
const log = (message: string) => {
  const line = `[chain-e2e] ${message}`;
  e2eLogs.push(line);
  console.log(line);
};

function parseDerSPKI(derBytes: Uint8Array): Uint8Array {
  if (derBytes.length !== SECP256R1_SPKI_HEADER.length + 65) {
    throw new Error("Invalid DER length");
  }
  for (let i = 0; i < SECP256R1_SPKI_HEADER.length; i += 1) {
    if (derBytes[i] !== SECP256R1_SPKI_HEADER[i]) {
      throw new Error("Invalid SPKI header");
    }
  }
  if (derBytes[SECP256R1_SPKI_HEADER.length] !== 0x04) {
    throw new Error("Invalid point marker");
  }
  return derBytes.slice(SECP256R1_SPKI_HEADER.length);
}

function derivePasskeyAddress(rawPublicKey: Uint8Array) {
  const suiBytes = new Uint8Array(rawPublicKey.length + 1);
  suiBytes[0] = PASSKEY_FLAG;
  suiBytes.set(rawPublicKey, 1);
  const digest = blake2b(suiBytes, { dkLen: 32 });
  const hex = bytesToHex(digest).slice(0, SUI_ADDRESS_LENGTH * 2);
  return normalizeSuiAddress(hex);
}

function getNetwork(): string {
  return process.env.NEXT_PUBLIC_SUI_NETWORK || process.env.SUI_NETWORK || "testnet";
}

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SUI_RPC_URL || process.env.SUI_RPC_URL;
  if (explicit) return explicit;
  return getFullnodeUrl(getNetwork());
}

async function saveGuideShot(page: any, name: string) {
  const dir = path.resolve(process.cwd(), "docs/assets/user-flow");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, name);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function waitForChainOrderId(userAddress: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  const target = normalizeSuiAddress(userAddress);
  while (Date.now() < deadline) {
    try {
      const orders = await fetchChainOrders();
      const hit = orders.find((order) => order.user === target);
      if (hit) return hit.orderId;
    } catch {
      // transient chain RPC errors are handled by retrying
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return null;
}

async function waitForStatusWithRetry(
  orderId: string,
  status: number,
  action: () => Promise<void>,
  options: { attempts?: number; timeoutMs?: number; pollMs?: number } = {}
) {
  const attempts = options.attempts ?? 2;
  const timeoutMs = options.timeoutMs ?? 240_000;
  const pollMs = options.pollMs ?? 5_000;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await action();
    try {
      return await waitForOrderStatus(orderId, status, { timeoutMs, pollMs });
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError || new Error(`Timed out waiting for order ${orderId} to reach status ${status}`);
}

async function submitPayAndWaitForOrderId(
  page: any,
  address: string,
  payBtn: any,
  refreshBalanceBtn: any
): Promise<string | null> {
  const attempts = Number(process.env.E2E_PAY_RETRY_ATTEMPTS || "3");
  const orderTimeoutMs = Number(process.env.E2E_PAY_ORDER_TIMEOUT_MS || "120000");
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (await payBtn.isEnabled().catch(() => false)) {
      await payBtn.click({ force: true });
    }
    const orderId = await waitForChainOrderId(address, orderTimeoutMs);
    if (orderId) return orderId;
    const toastText = (await page.locator(".ride-toast").textContent().catch(() => ""))?.trim();
    if (toastText) {
      log(`pay attempt ${attempt} toast: ${toastText}`);
    }
    if (await refreshBalanceBtn.isVisible().catch(() => false)) {
      await refreshBalanceBtn.click();
    }
    await page.waitForTimeout(2_000 + attempt * 2_000);
  }
  return null;
}

async function retryRpc<T>(fn: () => Promise<T>, attempts = 4) {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const message = lastError.message || "";
      const shouldRetry =
        message.includes("429") ||
        message.toLowerCase().includes("too many requests") ||
        message.toLowerCase().includes("timeout") ||
        message.toLowerCase().includes("fetch failed") ||
        message.toLowerCase().includes("socket") ||
        message.toLowerCase().includes("connect timeout");
      if (attempt < attempts - 1 && shouldRetry) {
        await new Promise((resolve) => setTimeout(resolve, 800 + attempt * 800));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError || new Error("rpc failed");
}

async function ensureGas(address: string) {
  const client = new SuiClient({ url: getRpcUrl() });
  const balance = await retryRpc(() => client.getBalance({ owner: address }));
  const total = BigInt(balance.totalBalance || "0");
  log(`passkey address ${address} balance: ${total}`);
  if (total >= MIN_GAS) return;

  if (process.env.E2E_MANUAL_FUNDING === "1") {
    log(`waiting for manual funding: ${address}`);
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      const next = await client.getBalance({ owner: address });
      const nextTotal = BigInt(next.totalBalance || "0");
      if (nextTotal >= MIN_GAS) return;
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    throw new Error("Manual funding timed out; please fund the passkey address and retry.");
  }

  const funderKey = process.env.E2E_FUNDER_PRIVATE_KEY || process.env.SUI_ADMIN_PRIVATE_KEY || "";
  if (funderKey) {
    try {
      const keypair = Ed25519Keypair.fromSecretKey(funderKey);
      const funderAddress = keypair.getPublicKey().toSuiAddress();
      const funderBalance = await retryRpc(() => client.getBalance({ owner: funderAddress }));
      const funderTotal = BigInt(funderBalance.totalBalance || "0");
      const envMax = BigInt(process.env.E2E_FUND_MAX || "200000000");
      const hardCap = BigInt("200000000"); // 0.2 SUI
      const maxFund = envMax > hardCap ? hardCap : envMax;
      const half = funderTotal / 2n;
      const amount = maxFund > half ? half : maxFund;
      if (amount < MIN_GAS) {
        throw new Error("Funder balance too low");
      }
      log(`funding from ${funderAddress} amount ${amount}`);
      const tx = new Transaction();
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount.toString())]);
      tx.transferObjects([coin], tx.pure.address(address));
      const result = await retryRpc(() =>
        client.signAndExecuteTransaction({
          signer: keypair,
          transaction: tx,
          options: { showEffects: true },
        })
      );
      if (result.effects?.status?.status !== "success") {
        throw new Error(result.effects?.status?.error || "Funder transfer failed.");
      }
      log(`funding digest ${result.digest}`);
      await retryRpc(() => client.waitForTransaction({ digest: result.digest }));
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        const next = await retryRpc(() => client.getBalance({ owner: address }));
        const nextTotal = BigInt(next.totalBalance || "0");
        if (nextTotal >= MIN_GAS) return;
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      throw new Error("Funder transfer failed to provide enough gas.");
    } catch (e) {
      const msg = (e as Error).message || "";
      if (!msg.includes("InsufficientCoinBalance") && !msg.includes("Funder balance too low")) {
        throw e;
      }
    }
  }

  const host = getFaucetHost(getNetwork() as "testnet" | "devnet" | "localnet");
  log(`faucet funding via ${host}`);
  await retryRpc(() => requestSuiFromFaucetV1({ host, recipient: address }));

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const next = await retryRpc(() => client.getBalance({ owner: address }));
    const nextTotal = BigInt(next.totalBalance || "0");
    if (nextTotal >= MIN_GAS) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error("Faucet funding timed out; please fund the passkey address manually.");
}

test.describe.configure({ mode: "serial" });

test.describe("chain e2e passkey", () => {
  ensureChainEnvLoaded();

  const adminToken = process.env.ADMIN_DASH_TOKEN || process.env.LEDGER_ADMIN_TOKEN || "";
  const hasChainFlag = process.env.NEXT_PUBLIC_CHAIN_ORDERS === "1";
  const hasCompanion = Boolean(process.env.NEXT_PUBLIC_QY_DEFAULT_COMPANION);
  const isChainProfile = process.env.PW_PROFILE === "chain";
  const shouldRun = hasChainFlag && hasCompanion && isChainProfile;

  test.skip(!shouldRun, "Chain E2E requires PW_PROFILE=chain and NEXT_PUBLIC_CHAIN_ORDERS=1");
  const defaultTimeout = process.env.E2E_MANUAL_FUNDING === "1" ? 720_000 : 600_000;
  const timeoutMs = Number(process.env.E2E_TEST_TIMEOUT_MS || defaultTimeout);
  test.setTimeout(timeoutMs);

  test("passkey creates, disputes, and resolves order on chain", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "WebAuthn virtual authenticator only works in Chromium");
    e2eLogs.length = 0;
    resetRpcLogs();
    const testInfo = test.info();
    try {
      const client = await context.newCDPSession(page);
      await client.send("WebAuthn.enable");
      const { authenticatorId } = await client.send("WebAuthn.addVirtualAuthenticator", {
        options: {
          protocol: "ctap2",
          transport: "usb",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      });
      await client.send("WebAuthn.setUserVerified", { authenticatorId, isUserVerified: true });
      await client.send("WebAuthn.setAutomaticPresenceSimulation", { authenticatorId, enabled: true });

      await page.addInitScript(() => {
        (window as typeof window & { __rpcLogs?: Array<Record<string, unknown>> }).__rpcLogs = [];
        const originFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          const url = typeof input === "string" ? input : input.url;
          if (url && url.includes("sui.io")) {
            const start = Date.now();
            let method = "unknown";
            let params: unknown = undefined;
            if (init?.body && typeof init.body === "string") {
              try {
                const payload = JSON.parse(init.body) as { method?: string; params?: unknown };
                method = payload.method || method;
                params = payload.params;
              } catch {
                /* ignore */
              }
            }
            (window as typeof window & { __rpcLogs?: Array<Record<string, unknown>> }).__rpcLogs?.push({
              type: "request",
              method,
              params,
              at: Date.now(),
            });
            const response = await originFetch(input, init);
            let errorMessage = "";
            try {
              const cloned = response.clone();
              const json = (await cloned.json()) as { error?: { message?: string } };
              if (json?.error?.message) errorMessage = json.error.message;
            } catch {
              /* ignore */
            }
            (window as typeof window & { __rpcLogs?: Array<Record<string, unknown>> }).__rpcLogs?.push({
              type: "response",
              method,
              status: response.status,
              ok: response.ok,
              durationMs: Date.now() - start,
              error: errorMessage || undefined,
              at: Date.now(),
            });
            return response;
          }
          return originFetch(input, init);
        };
      });

    await page.goto("/schedule", { waitUntil: "domcontentloaded" });

    const derBase64 = await page.evaluate(async () => {
      const hostname = location.hostname;
      const rpId =
        hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1" ? "localhost" : hostname;
      const publicKey = {
        rp: { name: "情谊电竞", id: rpId },
        user: { id: new Uint8Array(10), name: "playwright", displayName: "playwright" },
        challenge: new Uint8Array(16),
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: {
          authenticatorAttachment: "cross-platform",
          residentKey: "required",
          requireResidentKey: true,
          userVerification: "preferred",
        },
      } as PublicKeyCredentialCreationOptions;

      const cred = await navigator.credentials.create({ publicKey });
      if (!cred || !("response" in cred)) throw new Error("Passkey create failed");
      const response = cred.response as AuthenticatorAttestationResponse;
      const der = response.getPublicKey?.();
      if (!der) throw new Error("Passkey public key missing");
      return btoa(String.fromCharCode(...new Uint8Array(der)));
    });

    const derBytes = Uint8Array.from(Buffer.from(derBase64, "base64"));
    const uncompressed = parseDerSPKI(derBytes);
    const compressed = secp256r1.ProjectivePoint.fromHex(uncompressed).toRawBytes(true);
    const address = derivePasskeyAddress(compressed);
    const addressFromLib = new PasskeyPublicKey(compressed).toSuiAddress();
    expect(addressFromLib).toBe(address);
    log(`passkey address derived ${address}`);
    const publicKeyBase64 = Buffer.from(compressed).toString("base64");

    await page.evaluate(
      ({ address: addr, publicKey }) => {
        localStorage.setItem("qy_passkey_wallet_v3", JSON.stringify({ address: addr, publicKey }));
        (window as typeof window & { __QY_COMPANION_OVERRIDE__?: string }).__QY_COMPANION_OVERRIDE__ = addr;
        window.dispatchEvent(new Event("passkey-updated"));
      },
      { address, publicKey: publicKeyBase64 }
    );
    await saveGuideShot(page, "01-passkey-login.png");

    await page.goto("/me/game-settings", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("如：夜风").fill("DeltaUser");
    await page.getByPlaceholder("请输入游戏ID").fill("123456");
    await page.getByRole("button", { name: "保存设置" }).click();
    await expect(page.getByText("已保存")).toBeVisible({ timeout: 10_000 });
    await saveGuideShot(page, "02-game-settings.png");

    await page.goto("/wallet", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("钻石充值")).toBeVisible({ timeout: 10_000 });
    await saveGuideShot(page, "03-topup.png");

    await page.goto("/schedule", { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ({ addr, publicKey }) => {
        localStorage.setItem("qy_passkey_wallet_v3", JSON.stringify({ address: addr, publicKey }));
        (window as typeof window & { __QY_COMPANION_OVERRIDE__?: string }).__QY_COMPANION_OVERRIDE__ = addr;
        window.dispatchEvent(new Event("passkey-updated"));
      },
      { addr: address, publicKey: publicKeyBase64 }
    );

    const callBtn = page.getByRole("button", { name: /先(付撮合费|托管)再呼叫/ });
    await expect(callBtn).toBeVisible({ timeout: 60_000 });

    expect(address).not.toBe("");
    await test.step("prepare funds", async () => {
      await ensureGas(address);
      const credit = await creditBalanceOnChain({
        user: address,
        amount: 100,
        receiptId: `e2e-${Date.now()}`,
      });
      log(`credit balance digest ${credit.digest}`);
    });

    const firstCheckbox = page.locator(".ride-items input[type=checkbox]").first();
    await firstCheckbox.check();
    await callBtn.click();
    await saveGuideShot(page, "04-open-escrow.png");

    const paidCheckbox = page.getByRole("checkbox", { name: "已确认托管费用" });
    await paidCheckbox.check();

    const payBtn = page.getByRole("button", { name: "扣减钻石并派单" });
    const refreshBalanceBtn = page.getByRole("button", { name: "刷新余额" });
    const waitPayEnabled = async () => {
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        if (await payBtn.isEnabled()) return true;
        if (await refreshBalanceBtn.isVisible().catch(() => false)) {
          await refreshBalanceBtn.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      return false;
    };
    const payReady = await waitPayEnabled();
    if (!payReady) {
      throw new Error("钻石余额未就绪，无法派单");
    }
    const orderId = await submitPayAndWaitForOrderId(page, address, payBtn, refreshBalanceBtn);
    if (!orderId) {
      const toastText = (await page.locator(".ride-toast").textContent().catch(() => ""))?.trim();
      throw new Error(toastText ? `派单仍未完成: ${toastText}` : "派单弹窗未完成");
    }
    if (await page.locator(".ride-modal-mask").isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "取消" }).click().catch(() => {});
      await page.locator(".ride-modal-mask").waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
    }
    await saveGuideShot(page, "05-order-created.png");

    log(`order id ${orderId}`);

    await waitForOrderStatus(orderId, 1, { timeoutMs: 120_000, pollMs: 2_000 });
    log(`order ${orderId} status -> 已托管费用`);

    await page.goto("/showcase", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "刷新订单" }).click();

    const orderCard = page.locator(".dl-card", { hasText: `订单 #${orderId}` });
    await expect(orderCard).toBeVisible({ timeout: 90_000 });
    await expect(orderCard.getByText(/状态：已(托管费用|支付撮合费)/)).toBeVisible({ timeout: 90_000 });
    await saveGuideShot(page, "06-chain-order.png");

    const depositBtn = orderCard.getByRole("button", { name: "付押金接单" });
    const depositAction = async () => {
      await expect(depositBtn).toBeVisible();
      page.once("dialog", (dialog) => dialog.accept());
      await depositBtn.click();
    };
    await waitForStatusWithRetry(orderId, 2, depositAction, { attempts: 2, timeoutMs: 240_000, pollMs: 2_000 });
    log(`order ${orderId} status -> 押金已锁定`);
    await page.getByRole("button", { name: "刷新订单" }).click();
    await expect(orderCard.getByText("状态：押金已锁定")).toBeVisible({ timeout: 90_000 });
    await expect(orderCard.getByText(/游戏名/)).toBeVisible({ timeout: 90_000 });
    await expect(orderCard.getByRole("button", { name: "复制" })).toBeVisible({ timeout: 90_000 });
    await saveGuideShot(page, "07-deposit-locked.png");

    if (!adminToken) {
      throw new Error("ADMIN_DASH_TOKEN/LEDGER_ADMIN_TOKEN 缺失，无法注入馒头");
    }
    const seedRes = await page.request.post("/api/mantou/seed", {
      data: { address, amount: 1, note: `e2e seed ${orderId}` },
      headers: { "x-admin-token": adminToken },
    });
    if (!seedRes.ok()) {
      const payload = await seedRes.json().catch(() => ({}));
      throw new Error(`馒头注入失败: ${seedRes.status()} ${JSON.stringify(payload)}`);
    }

    await page.goto("/me/mantou", { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ({ addr, publicKey }) => {
        localStorage.setItem("qy_passkey_wallet_v3", JSON.stringify({ address: addr, publicKey }));
        window.dispatchEvent(new Event("passkey-updated"));
      },
      { addr: address, publicKey: publicKeyBase64 }
    );
    await expect(page.getByText("我的馒头")).toBeVisible({ timeout: 10_000 });
    const waitMantouBalance = async () => {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const res = await page.request.get(`/api/mantou/balance?address=${address}`);
        if (res.ok()) {
          const data = await res.json();
          const balance = Number(data?.balance || 0);
          if (balance > 0) return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      return false;
    };
    await waitMantouBalance();
    const amountInput = page.locator("input[type=number]").first();
    const accountInput = page.getByPlaceholder("微信/支付宝账号");
    await amountInput.fill("");
    await amountInput.type("1", { delay: 50 });
    await accountInput.fill("");
    await accountInput.type("test-account", { delay: 20 });
    await accountInput.press("Tab");
    await expect(amountInput).toHaveValue("1");
    await expect(accountInput).toHaveValue("test-account");
    const submitWithdraw = page.getByRole("button", { name: "提交提现" });
    await expect(submitWithdraw).toBeEnabled({ timeout: 15_000 });
    await submitWithdraw.scrollIntoViewIfNeeded();
    await submitWithdraw.click({ force: true });
    const waitMantouWithdraw = async () => {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const errorText =
          (await page
            .locator("text=/请先登录账号|提交失败|请输入正确的提现数量|请填写收款账号/")
            .first()
            .textContent()
            .catch(() => "")) || "";
        if (errorText.trim()) {
          throw new Error(errorText.trim());
        }
        const okTip = await page.getByText("已提交提现申请").isVisible().catch(() => false);
        if (okTip) return true;
        const emptyStateVisible = await page.getByText("暂无提现记录").isVisible().catch(() => false);
        if (!emptyStateVisible) return true;
        const statusVisible = await page.getByText("状态：").first().isVisible().catch(() => false);
        if (statusVisible) return true;
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      return false;
    };
    const withdrawOk = await waitMantouWithdraw();
    if (!withdrawOk) {
      const msgText = (await page.locator("text=/已提交提现申请|余额不足|提交失败/").textContent().catch(() => ""))
        ?.trim();
      throw new Error(msgText || "提现申请未创建");
    }
    await saveGuideShot(page, "12-mantou-withdraw.png");

    await page.goto("/showcase", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "刷新订单" }).click();

    const completeBtn = orderCard.getByRole("button", { name: "确认完成" });
    const completeAction = async () => {
      await expect(completeBtn).toBeVisible();
      page.once("dialog", (dialog) => dialog.accept());
      await completeBtn.click();
    };
    await waitForStatusWithRetry(orderId, 3, completeAction, { attempts: 2, timeoutMs: 240_000, pollMs: 5_000 });
    log(`order ${orderId} status -> 已完成待结算`);
    await page.getByRole("button", { name: "刷新订单" }).click();
    await expect(orderCard.getByText("状态：已完成待结算")).toBeVisible({ timeout: 90_000 });
    await saveGuideShot(page, "08-user-confirmed.png");

    const disputeBtn = orderCard.getByRole("button", { name: "发起争议" });
    await expect(disputeBtn).toBeVisible();
    await disputeBtn.click();
    const disputeModal = page.getByRole("dialog", { name: "发起争议" });
    await expect(disputeModal).toBeVisible({ timeout: 10_000 });
    await disputeModal.getByPlaceholder("请输入争议说明或证据哈希").fill("playwright dispute");
    await disputeModal.getByRole("button", { name: "提交争议" }).click();
    await waitForOrderStatus(orderId, 4, { timeoutMs: 240_000, pollMs: 5_000 });
    log(`order ${orderId} status -> 争议中`);
    await page.getByRole("button", { name: "刷新订单" }).click();
    await expect(orderCard.getByText("状态：争议中")).toBeVisible({ timeout: 90_000 });
    await saveGuideShot(page, "09-dispute-raised.png");

    if (!adminToken) {
      throw new Error("ADMIN_DASH_TOKEN/LEDGER_ADMIN_TOKEN 缺失，无法继续争议裁决");
    }
    if (!adminToken) {
      throw new Error("ADMIN_DASH_TOKEN/LEDGER_ADMIN_TOKEN 缺失，无法继续争议裁决");
    }
    const loginApi = await page.request.post("/api/admin/login", {
      data: { token: adminToken },
    });
    if (!loginApi.ok()) {
      const payload = await loginApi.json().catch(() => ({}));
      throw new Error(`后台登录失败: ${loginApi.status()} ${JSON.stringify(payload)}`);
    }
    const setCookie = loginApi.headers()["set-cookie"] || "";
    const match = setCookie.match(/admin_session=([^;]+)/);
    if (!match) {
      throw new Error("后台登录失败：未获取到 session cookie");
    }
    await page.context().addCookies([
      {
        name: "admin_session",
        value: match[1],
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto("/admin/chain", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "刷新" }).click();
    const disputeCard = page.locator(".admin-card").filter({ hasText: `订单 #${orderId}` }).first();
    await expect(disputeCard).toBeVisible({ timeout: 90_000 });
    await saveGuideShot(page, "10-admin-dispute.png");
    await disputeCard.getByRole("button", { name: "提交裁决" }).first().click();

    await page.goto("/admin/mantou", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "刷新" }).click();
    await expect(page.getByText(address.slice(0, 10))).toBeVisible({ timeout: 15_000 });
    await saveGuideShot(page, "13-admin-mantou.png");

    await waitForOrderStatus(orderId, 5, { timeoutMs: 240_000, pollMs: 5_000 });
    log(`order ${orderId} status -> 已结算`);

    await page.goto("/showcase", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "刷新订单" }).click();
    const settledCard = page.locator(".dl-card", { hasText: `订单 #${orderId}` });
    await expect(settledCard.getByText("状态：已结算")).toBeVisible({ timeout: 90_000 });
    await saveGuideShot(page, "11-settled.png");
    } finally {
      try {
        const browserRpcLogs = await page.evaluate(() => {
          const logs = (window as typeof window & { __rpcLogs?: Array<Record<string, unknown>> }).__rpcLogs || [];
          return logs;
        });
        if (browserRpcLogs.length) {
          testInfo.attach("browser-rpc-log.json", {
            body: JSON.stringify(browserRpcLogs, null, 2),
            contentType: "application/json",
          });
        }
      } catch {
        /* ignore */
      }
      const rpcLogs = getRpcLogs();
      if (rpcLogs.length) {
        testInfo.attach("node-rpc-log.txt", {
          body: rpcLogs.join("\n"),
          contentType: "text/plain",
        });
      }
      if (e2eLogs.length) {
        testInfo.attach("chain-e2e-log.txt", {
          body: e2eLogs.join("\n"),
          contentType: "text/plain",
        });
      }
    }
  });
});
