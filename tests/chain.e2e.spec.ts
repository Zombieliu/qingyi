import { test, expect } from "@playwright/test";
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

const MIN_GAS = 50_000_000n; // 0.05 SUI
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

async function ensureGas(address: string) {
  const client = new SuiClient({ url: getRpcUrl() });
  const balance = await client.getBalance({ owner: address });
  const total = BigInt(balance.totalBalance || "0");
  log(`passkey address ${address} balance: ${total}`);
  if (total >= MIN_GAS) return;

  const funderKey = process.env.E2E_FUNDER_PRIVATE_KEY || process.env.SUI_ADMIN_PRIVATE_KEY || "";
  if (funderKey) {
    try {
      const keypair = Ed25519Keypair.fromSecretKey(funderKey);
      const funderAddress = keypair.getPublicKey().toSuiAddress();
      const funderBalance = await client.getBalance({ owner: funderAddress });
      const funderTotal = BigInt(funderBalance.totalBalance || "0");
      const amount = funderTotal / 2n;
      if (amount < MIN_GAS) {
        throw new Error("Funder balance too low");
      }
      log(`funding from ${funderAddress} amount ${amount}`);
      const tx = new Transaction();
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount.toString())]);
      tx.transferObjects([coin], tx.pure.address(address));
      const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: { showEffects: true },
      });
      if (result.effects?.status?.status !== "success") {
        throw new Error(result.effects?.status?.error || "Funder transfer failed.");
      }
      log(`funding digest ${result.digest}`);
      await client.waitForTransaction({ digest: result.digest });
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        const next = await client.getBalance({ owner: address });
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
  await requestSuiFromFaucetV1({ host, recipient: address });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const next = await client.getBalance({ owner: address });
    const nextTotal = BigInt(next.totalBalance || "0");
    if (nextTotal >= MIN_GAS) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error("Faucet funding timed out; please fund the passkey address manually.");
}

test.describe.configure({ mode: "serial" });

test.describe("chain e2e passkey", () => {
  ensureChainEnvLoaded();

  const hasChainFlag = process.env.NEXT_PUBLIC_CHAIN_ORDERS === "1";
  const hasCompanion = Boolean(process.env.NEXT_PUBLIC_QY_DEFAULT_COMPANION);
  const isChainProfile = process.env.PW_PROFILE === "chain";
  const shouldRun = hasChainFlag && hasCompanion && isChainProfile;

  test.skip(!shouldRun, "Chain E2E requires PW_PROFILE=chain and NEXT_PUBLIC_CHAIN_ORDERS=1");
  test.setTimeout(300_000);

  test("passkey creates, pays, and cancels order on chain", async ({ page, context, browserName }) => {
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
      const publicKey = {
        rp: { name: "情谊电竞", id: location.hostname },
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
        window.dispatchEvent(new Event("passkey-updated"));
      },
      { address, publicKey: publicKeyBase64 }
    );

    const callBtn = page.getByRole("button", { name: "先付撮合费再呼叫" });
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

    const paidCheckbox = page.getByRole("checkbox", { name: "已支付撮合费" });
    await paidCheckbox.check();

    const payBtn = page.getByRole("button", { name: "支付完成，开始派单" });
    await payBtn.click();

    const deadline = Date.now() + 120_000;
    let orderId: string | null = null;
    let lastToast = "";
    while (Date.now() < deadline && !orderId) {
      orderId = await page.evaluate(() => {
        const raw = localStorage.getItem("dl_orders");
        if (!raw) return null;
        try {
          const list = JSON.parse(raw) as { id?: string; status?: string }[];
          const active = list.find((o) => o && o.id && o.status !== "取消");
          return active?.id ?? null;
        } catch {
          return null;
        }
      });
      lastToast = await page.evaluate(() => document.querySelector(".ride-toast")?.textContent?.trim() || "");
      if (lastToast && !orderId) {
        break;
      }
      await page.waitForTimeout(1_000);
    }

    if (!orderId) {
      throw new Error(lastToast ? `Failed to create order: ${lastToast}` : "Failed to create chain order.");
    }
    if (!orderId || typeof orderId !== "string") {
      throw new Error("Failed to read chain order id from localStorage.");
    }
    log(`order id ${orderId}`);

    await waitForOrderStatus(orderId, 1, { timeoutMs: 120_000, pollMs: 2_000 });
    log(`order ${orderId} status -> 已支付撮合费`);

    await page.goto("/showcase", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "刷新链上订单" }).click();

    const orderCard = page.locator(".dl-card", { hasText: `链上订单 #${orderId}` });
    await expect(orderCard).toBeVisible({ timeout: 90_000 });
    await expect(orderCard.getByText("状态：已支付撮合费")).toBeVisible({ timeout: 90_000 });

    const cancelBtn = orderCard.getByRole("button", { name: "取消订单" });
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    await waitForOrderStatus(orderId, 6, { timeoutMs: 120_000, pollMs: 2_000 });
    log(`order ${orderId} status -> 已取消`);
      await page.getByRole("button", { name: "刷新链上订单" }).click();
      await expect(orderCard.getByText("状态：已取消")).toBeVisible({ timeout: 90_000 });
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
