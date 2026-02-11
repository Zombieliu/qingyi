"use client";

import { SuiClient, getFullnodeUrl, type EventId } from "@mysten/sui/client";
import { bcs } from "@mysten/sui/bcs";
import { Transaction, Inputs } from "@mysten/sui/transactions";
import { fromBase64, isValidSuiAddress, normalizeSuiAddress, toBase64, toHex } from "@mysten/sui/utils";
import {
  PasskeyKeypair,
  BrowserPasskeyProvider,
  type BrowserPasswordProviderOptions,
} from "@mysten/sui/keypairs/passkey";
import { PASSKEY_STORAGE_KEY } from "@/app/components/passkey-wallet";
import { DAPP_HUB_ID, DAPP_HUB_INITIAL_SHARED_VERSION, PACKAGE_ID } from "contracts/deployment";
import { buildAuthMessage } from "./auth-message";

type StoredWallet = {
  address: string;
  publicKey: string;
};

export type ChainOrder = {
  orderId: string;
  user: string;
  companion: string;
  ruleSetId: string;
  serviceFee: string;
  deposit: string;
  platformFeeBps: string;
  status: number;
  createdAt: string;
  finishAt: string;
  disputeDeadline: string;
  vaultService: string;
  vaultDeposit: string;
  evidenceHash: string;
  disputeStatus: number;
  resolvedBy: string;
  resolvedAt: string;
  lastUpdatedMs?: number;
};

const RP_NAME = "情谊电竞";
const CHAIN_ORDERS_FLAG = process.env.NEXT_PUBLIC_CHAIN_ORDERS === "1";
const VISUAL_TEST_FLAG = process.env.NEXT_PUBLIC_VISUAL_TEST === "1";
const EVENT_LIMIT = Number(process.env.NEXT_PUBLIC_QY_EVENT_LIMIT || "200");
const EVENT_MIN_INTERVAL_MS = Number(process.env.NEXT_PUBLIC_QY_EVENT_MIN_INTERVAL_MS || "60000");
const CHAIN_SPONSOR_MODE = (process.env.NEXT_PUBLIC_CHAIN_SPONSOR || "auto").toLowerCase();

let cachedDubhePackageId: string | null = null;
let cachedOrders: ChainOrder[] | null = null;
let lastFetchMs = 0;
let inFlightFetch: Promise<ChainOrder[]> | null = null;

export function isVisualTestMode(): boolean {
  if (VISUAL_TEST_FLAG) return true;
  if (typeof window === "undefined") return false;
  const flags = window as { __PW_VISUAL_TEST__?: boolean; __VISUAL_TEST__?: boolean };
  return Boolean(flags.__PW_VISUAL_TEST__ || flags.__VISUAL_TEST__);
}

function isSponsorEnabled() {
  return !["0", "off", "false"].includes(CHAIN_SPONSOR_MODE);
}

function isSponsorStrict() {
  return ["1", "on", "true"].includes(CHAIN_SPONSOR_MODE);
}

function getProviderOptions(): BrowserPasswordProviderOptions {
  return {
    rp: {
      id: typeof window !== "undefined" ? window.location.hostname : undefined,
    },
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "preferred" },
  };
}

function getStoredWallet(): StoredWallet {
  if (typeof window === "undefined") {
    throw new Error("仅支持在浏览器端使用 Passkey");
  }
  const raw = localStorage.getItem(PASSKEY_STORAGE_KEY);
  if (!raw) {
    throw new Error("未找到 Passkey 钱包，请先登录");
  }
  let parsed: StoredWallet;
  try {
    parsed = JSON.parse(raw) as StoredWallet;
  } catch {
    throw new Error("Passkey 数据损坏，请重新登录");
  }
  if (!parsed.address || !parsed.publicKey) {
    throw new Error("Passkey 数据不完整，请重新登录");
  }
  return parsed;
}

export function getCurrentAddress(): string {
  try {
    return getStoredWallet().address;
  } catch {
    return "";
  }
}

async function sha256Base64(value: string) {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("浏览器不支持安全签名");
  }
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toBase64(new Uint8Array(digest));
}

export async function signAuthIntent(intent: string, body?: string) {
  const wallet = getStoredWallet();
  const timestamp = Date.now();
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = toBase64(nonceBytes);
  const bodyHash = body ? await sha256Base64(body) : "";
  const message = buildAuthMessage({
    intent,
    address: wallet.address,
    timestamp,
    nonce,
    bodyHash,
  });

  const provider = new BrowserPasskeyProvider(RP_NAME, getProviderOptions());
  const keypair = new PasskeyKeypair(fromBase64(wallet.publicKey), provider);
  const signed = await keypair.signPersonalMessage(new TextEncoder().encode(message));

  return { address: wallet.address, signature: signed.signature, timestamp, nonce, bodyHash };
}

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SUI_RPC_URL;
  if (explicit) return explicit;
  const network = normalizeSuiNetwork(process.env.NEXT_PUBLIC_SUI_NETWORK);
  return getFullnodeUrl(network);
}

type SuiNetwork = "testnet" | "mainnet" | "devnet" | "localnet";

function normalizeSuiNetwork(value?: string): SuiNetwork {
  switch (value) {
    case "mainnet":
    case "testnet":
    case "devnet":
    case "localnet":
      return value;
    default:
      return "testnet";
  }
}

function getRuleSetId(): string {
  const rule = process.env.NEXT_PUBLIC_QY_RULESET_ID || "1";
  if (!/^[0-9]+$/.test(rule)) {
    throw new Error("规则集 ID 不合法");
  }
  return rule;
}

function getDefaultCompanion(): string {
  let addr = process.env.NEXT_PUBLIC_QY_DEFAULT_COMPANION || "";
  if (typeof window !== "undefined") {
    const override = (window as { __QY_COMPANION_OVERRIDE__?: string }).__QY_COMPANION_OVERRIDE__;
    if (override) {
      addr = override;
    }
  }
  if (!addr) {
    throw new Error("未配置默认陪玩地址（NEXT_PUBLIC_QY_DEFAULT_COMPANION）");
  }
  const normalized = normalizeSuiAddress(addr);
  if (!isValidSuiAddress(normalized)) {
    throw new Error("默认陪玩地址无效");
  }
  return normalized;
}

export function getDefaultCompanionAddress(): string {
  return getDefaultCompanion();
}

function getDappHubSharedRef() {
  const dappHubId = String(DAPP_HUB_ID || "");
  if (!dappHubId || dappHubId === "0x0") {
    throw new Error("合约未部署：缺少 DAPP_HUB_ID");
  }
  const sharedVersion = String(DAPP_HUB_INITIAL_SHARED_VERSION || "");
  if (!sharedVersion || sharedVersion === "0") {
    throw new Error("合约未部署：缺少 DAPP_HUB_INITIAL_SHARED_VERSION");
  }
  return Inputs.SharedObjectRef({
    objectId: dappHubId,
    initialSharedVersion: sharedVersion,
    mutable: true,
  });
}

async function getDubhePackageId(client: SuiClient): Promise<string> {
  if (cachedDubhePackageId) return cachedDubhePackageId;
  const obj = await client.getObject({ id: DAPP_HUB_ID, options: { showType: true } });
  const type = obj.data?.type;
  if (!type) {
    throw new Error("无法读取 DappHub 类型");
  }
  cachedDubhePackageId = type.split("::")[0];
  return cachedDubhePackageId;
}

function ensurePackageId() {
  const packageId = String(PACKAGE_ID || "");
  if (!packageId || packageId === "0x0") {
    throw new Error("合约未部署：缺少 PACKAGE_ID");
  }
}

function toChainAmount(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("金额不合法");
  }
  return String(Math.round(n * 100));
}

function ensureOrderId(orderId: string) {
  if (!/^[0-9]+$/.test(orderId)) {
    throw new Error("orderId 必须是数字字符串");
  }
}

function strip0x(value: string) {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function normalizeDappKey(value: string) {
  return strip0x(value.trim().toLowerCase());
}

function decodeU64(bytes: number[]): string {
  return bcs.u64().parse(Uint8Array.from(bytes));
}

function decodeU8(bytes: number[]): number {
  return bcs.u8().parse(Uint8Array.from(bytes));
}

function decodeAddress(bytes: number[]): string {
  const hex = toHex(Uint8Array.from(bytes));
  return normalizeSuiAddress(`0x${hex}`);
}

function decodeVecU8(bytes: number[]): string {
  const raw = bcs.vector(bcs.u8()).parse(Uint8Array.from(bytes)) as number[];
  return `0x${toHex(Uint8Array.from(raw))}`;
}

function decodeOrderFromTuple(keyTuple: number[][], valueTuple: number[][]): ChainOrder | null {
  if (!Array.isArray(keyTuple) || keyTuple.length < 1) return null;
  if (!Array.isArray(valueTuple) || valueTuple.length < 16) return null;
  const orderId = decodeU64(keyTuple[0]);
  return {
    orderId,
    user: decodeAddress(valueTuple[0]),
    companion: decodeAddress(valueTuple[1]),
    ruleSetId: decodeU64(valueTuple[2]),
    serviceFee: decodeU64(valueTuple[3]),
    deposit: decodeU64(valueTuple[4]),
    platformFeeBps: decodeU64(valueTuple[5]),
    status: decodeU8(valueTuple[6]),
    createdAt: decodeU64(valueTuple[7]),
    finishAt: decodeU64(valueTuple[8]),
    disputeDeadline: decodeU64(valueTuple[9]),
    vaultService: decodeU64(valueTuple[10]),
    vaultDeposit: decodeU64(valueTuple[11]),
    evidenceHash: decodeVecU8(valueTuple[12]),
    disputeStatus: decodeU8(valueTuple[13]),
    resolvedBy: decodeAddress(valueTuple[14]),
    resolvedAt: decodeU64(valueTuple[15]),
  };
}

function getSignerAndClient() {
  const wallet = getStoredWallet();
  const provider = new BrowserPasskeyProvider(RP_NAME, getProviderOptions());
  const signer = new PasskeyKeypair(fromBase64(wallet.publicKey), provider);
  const client = new SuiClient({ url: getRpcUrl() });
  return { signer, client, wallet };
}

async function executeSponsoredTransaction(tx: Transaction) {
  const { signer, client, wallet } = getSignerAndClient();
  tx.setSenderIfNotSet(wallet.address);
  const kindBytes = await tx.build({ client, onlyTransactionKind: true });
  const prepareRes = await fetch("/api/chain/sponsor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      step: "prepare",
      sender: wallet.address,
      kindBytes: toBase64(kindBytes),
    }),
  });
  const prepareData = await prepareRes.json().catch(() => ({}));
  if (!prepareRes.ok) {
    throw new Error(prepareData?.error || "赞助交易构建失败");
  }
  const txBytes = prepareData?.bytes;
  if (!txBytes || typeof txBytes !== "string") {
    throw new Error("赞助交易返回无效");
  }
  const userSignature = await signer.signTransaction(fromBase64(txBytes));
  const signature =
    typeof userSignature.signature === "string" ? userSignature.signature : toBase64(userSignature.signature);
  const execRes = await fetch("/api/chain/sponsor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      step: "execute",
      txBytes,
      userSignature: signature,
    }),
  });
  const execData = await execRes.json().catch(() => ({}));
  if (!execRes.ok) {
    throw new Error(execData?.error || "赞助交易失败");
  }
  return { digest: execData?.digest as string };
}

async function executeTransaction(tx: Transaction) {
  const shouldRetry = (message: string) =>
    message.includes("429") ||
    message.toLowerCase().includes("too many requests") ||
    message.toLowerCase().includes("timeout") ||
    message.toLowerCase().includes("fetch failed") ||
    message.toLowerCase().includes("socket");

  const withRetry = async <T,>(fn: () => Promise<T>, attempts = 3): Promise<T> => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        const message = lastError.message || "";
        if (attempt < attempts - 1 && shouldRetry(message)) {
          await new Promise((resolve) => setTimeout(resolve, 800 + attempt * 800));
          continue;
        }
        throw lastError;
      }
    }
    throw lastError || new Error("chain transaction failed");
  };

  const directExecute = async () => {
    const { signer, client } = getSignerAndClient();
    const result = await client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: { showEffects: true },
    });
    const status = result.effects?.status?.status;
    if (status && status !== "success") {
      throw new Error(result.effects?.status?.error || "链上交易失败");
    }
    return { digest: result.digest };
  };

  if (!isSponsorEnabled()) {
    return withRetry(directExecute);
  }

  try {
    return await withRetry(() => executeSponsoredTransaction(tx));
  } catch (error) {
    if (isSponsorStrict()) {
      throw error;
    }
    return withRetry(directExecute);
  }
}

export function isChainOrdersEnabled(): boolean {
  return CHAIN_ORDERS_FLAG || isVisualTestMode();
}

export function getChainDebugInfo() {
  return {
    packageId: PACKAGE_ID,
    dappHubId: DAPP_HUB_ID,
    dappHubInitialSharedVersion: DAPP_HUB_INITIAL_SHARED_VERSION,
    network: process.env.NEXT_PUBLIC_SUI_NETWORK || "",
    rpcUrl: process.env.NEXT_PUBLIC_SUI_RPC_URL || "",
    chainOrdersEnabled: isChainOrdersEnabled(),
    sponsorMode: CHAIN_SPONSOR_MODE,
    ruleSetId: getRuleSetId(),
    defaultCompanion: getDefaultCompanion(),
  };
}

export function createChainOrderId(): string {
  const now = Date.now();
  const rand = Math.floor(Math.random() * 1000);
  return String(now * 1000 + rand);
}

export async function createOrderOnChain(params: {
  orderId: string;
  serviceFee: number;
  deposit?: number;
  ruleSetId?: string;
  companion?: string;
  autoPay?: boolean;
  rawAmount?: boolean;
}) {
  ensurePackageId();
  ensureOrderId(params.orderId);
  const ruleSetId = params.ruleSetId ?? getRuleSetId();
  const companion = params.companion ?? getDefaultCompanion();
  const serviceFee = params.rawAmount ? String(Math.round(params.serviceFee)) : toChainAmount(params.serviceFee);
  const deposit = params.rawAmount ? String(Math.round(params.deposit ?? 0)) : toChainAmount(params.deposit ?? 0);

  const tx = new Transaction();
  const dappHub = getDappHubSharedRef();

  tx.moveCall({
    target: PACKAGE_ID + "::order_system::create_order",
    arguments: [
      tx.object(dappHub),
      tx.pure.u64(params.orderId),
      tx.pure.address(companion),
      tx.pure.u64(ruleSetId),
      tx.pure.u64(serviceFee),
      tx.pure.u64(deposit),
      tx.object("0x6"),
    ],
  });

  if (params.autoPay) {
    tx.moveCall({
      target: PACKAGE_ID + "::order_system::pay_service_fee",
      arguments: [tx.object(dappHub), tx.pure.u64(params.orderId)],
    });
  }

  return executeTransaction(tx);
}

export async function payServiceFeeOnChain(orderId: string) {
  ensurePackageId();
  ensureOrderId(orderId);
  const tx = new Transaction();
  const dappHub = getDappHubSharedRef();
  tx.moveCall({
    target: PACKAGE_ID + "::order_system::pay_service_fee",
    arguments: [tx.object(dappHub), tx.pure.u64(orderId)],
  });
  return executeTransaction(tx);
}

export async function claimOrderOnChain(orderId: string) {
  ensurePackageId();
  ensureOrderId(orderId);
  const tx = new Transaction();
  const dappHub = getDappHubSharedRef();
  tx.moveCall({
    target: PACKAGE_ID + "::order_system::claim_order",
    arguments: [tx.object(dappHub), tx.pure.u64(orderId)],
  });
  return executeTransaction(tx);
}

export async function lockDepositOnChain(orderId: string) {
  ensurePackageId();
  ensureOrderId(orderId);
  const tx = new Transaction();
  const dappHub = getDappHubSharedRef();
  tx.moveCall({
    target: PACKAGE_ID + "::order_system::lock_deposit",
    arguments: [tx.object(dappHub), tx.pure.u64(orderId)],
  });
  return executeTransaction(tx);
}

export async function markCompletedOnChain(orderId: string) {
  ensurePackageId();
  ensureOrderId(orderId);
  const tx = new Transaction();
  const dappHub = getDappHubSharedRef();
  tx.moveCall({
    target: PACKAGE_ID + "::order_system::mark_completed",
    arguments: [tx.object(dappHub), tx.pure.u64(orderId), tx.object("0x6")],
  });
  return executeTransaction(tx);
}

export async function raiseDisputeOnChain(orderId: string, evidence: string) {
  ensurePackageId();
  ensureOrderId(orderId);
  const tx = new Transaction();
  const dappHub = getDappHubSharedRef();
  const evidenceBytes = Array.from(new TextEncoder().encode(evidence || ""));
  tx.moveCall({
    target: PACKAGE_ID + "::order_system::raise_dispute",
    arguments: [
      tx.object(dappHub),
      tx.pure.u64(orderId),
      tx.pure.vector("u8", evidenceBytes),
      tx.object("0x6"),
    ],
  });
  return executeTransaction(tx);
}

export async function finalizeNoDisputeOnChain(orderId: string) {
  ensurePackageId();
  ensureOrderId(orderId);
  const tx = new Transaction();
  const dappHub = getDappHubSharedRef();
  tx.moveCall({
    target: PACKAGE_ID + "::order_system::finalize_no_dispute",
    arguments: [tx.object(dappHub), tx.pure.u64(orderId), tx.object("0x6")],
  });
  return executeTransaction(tx);
}

export async function cancelOrderOnChain(orderId: string) {
  ensurePackageId();
  ensureOrderId(orderId);
  const tx = new Transaction();
  const dappHub = getDappHubSharedRef();
  tx.moveCall({
    target: PACKAGE_ID + "::order_system::cancel_order",
    arguments: [tx.object(dappHub), tx.pure.u64(orderId)],
  });
  return executeTransaction(tx);
}

export async function fetchChainOrders(): Promise<ChainOrder[]> {
  if (isVisualTestMode()) {
    return [];
  }
  const now = Date.now();
  if (cachedOrders && now - lastFetchMs < EVENT_MIN_INTERVAL_MS) {
    return cachedOrders;
  }
  if (inFlightFetch) {
    return inFlightFetch;
  }
  inFlightFetch = (async () => {
    ensurePackageId();
    const dappHubId = String(DAPP_HUB_ID || "");
    if (!dappHubId || dappHubId === "0x0") {
      throw new Error("合约未部署：缺少 DAPP_HUB_ID");
    }
    const client = new SuiClient({ url: getRpcUrl() });
    const dubhePackageId = await getDubhePackageId(client);
    const eventType = `${dubhePackageId}::dubhe_events::Dubhe_Store_SetRecord`;
    const targetKey = normalizeDappKey(`${strip0x(PACKAGE_ID)}::dapp_key::DappKey`);
    const orders = new Map<string, ChainOrder>();

    let cursor: EventId | null = null;
    let remaining = Number.isFinite(EVENT_LIMIT) ? EVENT_LIMIT : 200;
    while (remaining > 0) {
      let page: Awaited<ReturnType<typeof client.queryEvents>>;
      let attempt = 0;
      while (true) {
        try {
          page = await client.queryEvents({
            query: { MoveEventType: eventType },
            limit: Math.min(50, remaining),
            order: "descending",
            cursor,
          });
          break;
        } catch (error) {
          const message = (error as Error).message || "";
          if (
            message.includes("429") ||
            message.toLowerCase().includes("too many requests") ||
            message.toLowerCase().includes("timeout") ||
            message.toLowerCase().includes("fetch failed") ||
            message.toLowerCase().includes("socket")
          ) {
            attempt += 1;
            if (attempt > 5) throw error;
            await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
            continue;
          }
          throw error;
        }
      }
      for (const event of page.data) {
        const parsed = event.parsedJson as {
          dapp_key?: string;
          table_id?: string;
          key_tuple?: number[][];
          value_tuple?: number[][];
        } | null;
        if (!parsed || parsed.table_id !== "order") continue;
        const dappKey = normalizeDappKey(parsed.dapp_key || "");
        if (dappKey !== targetKey) continue;
        const order = decodeOrderFromTuple(parsed.key_tuple || [], parsed.value_tuple || []);
        if (!order || orders.has(order.orderId)) continue;
        order.lastUpdatedMs = Number(event.timestampMs || 0);
        orders.set(order.orderId, order);
      }
      remaining -= page.data.length;
      if (!page.hasNextPage) break;
      cursor = page.nextCursor ?? null;
    }

    const result = Array.from(orders.values()).sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    cachedOrders = result;
    lastFetchMs = Date.now();
    return result;
  })();

  try {
    return await inFlightFetch;
  } finally {
    inFlightFetch = null;
  }
}
