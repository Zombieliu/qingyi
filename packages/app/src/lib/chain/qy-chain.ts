"use client";

import { SuiClient, getFullnodeUrl, type EventId } from "@mysten/sui/client";
import { bcs } from "@mysten/sui/bcs";
import { Transaction, Inputs } from "@mysten/sui/transactions";
import {
  fromBase64,
  isValidSuiAddress,
  normalizeSuiAddress,
  toBase64,
  toHex,
} from "@mysten/sui/utils";
import {
  PasskeyKeypair,
  BrowserPasskeyProvider,
  type BrowserPasswordProviderOptions,
} from "@mysten/sui/keypairs/passkey";
import { DAPP_HUB_ID, DAPP_HUB_INITIAL_SHARED_VERSION, PACKAGE_ID } from "contracts/deployment";
import { buildAuthMessage } from "../auth/auth-message";
import { ChainMessages, BrandName } from "@/lib/shared/messages";

// Re-export lightweight utilities so existing `import { getCurrentAddress } from "qy-chain"` still works
// but new code should import from qy-chain-lite directly to avoid pulling SUI SDK
export {
  getCurrentAddress,
  isChainOrdersEnabled,
  isVisualTestMode,
  createChainOrderId,
  getStoredWallet,
  PASSKEY_STORAGE_KEY,
} from "./qy-chain-lite";
import { isChainOrdersEnabled, isVisualTestMode, getStoredWallet } from "./qy-chain-lite";

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

const RP_NAME = BrandName.RP_NAME;
const EVENT_LIMIT = Number(process.env.NEXT_PUBLIC_QY_EVENT_LIMIT || "200");
const EVENT_MIN_INTERVAL_MS = Number(process.env.NEXT_PUBLIC_QY_EVENT_MIN_INTERVAL_MS || "60000");
const CHAIN_SPONSOR_MODE = (process.env.NEXT_PUBLIC_CHAIN_SPONSOR || "auto").toLowerCase();

let cachedDubhePackageId: string | null = null;
let cachedOrders: ChainOrder[] | null = null;
let lastFetchMs = 0;
let inFlightFetch: Promise<ChainOrder[]> | null = null;

function isSponsorEnabled() {
  return !["0", "off", "false"].includes(CHAIN_SPONSOR_MODE);
}

function isSponsorStrict() {
  return ["1", "on", "true"].includes(CHAIN_SPONSOR_MODE);
}

function getProviderOptions(): BrowserPasswordProviderOptions {
  const isAutomation = process.env.NEXT_PUBLIC_PASSKEY_AUTOMATION === "1";
  return {
    rp: {
      id: typeof window !== "undefined" ? window.location.hostname : undefined,
    },
    authenticatorSelection: {
      authenticatorAttachment: isAutomation ? "cross-platform" : "platform",
      residentKey: "preferred",
      requireResidentKey: false,
      userVerification: "preferred",
    },
  };
}

async function sha256Base64(value: string) {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error(ChainMessages.BROWSER_NOT_SUPPORTED);
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
    throw new Error(ChainMessages.RULESET_INVALID);
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
    throw new Error(ChainMessages.DEFAULT_COMPANION_MISSING);
  }
  const normalized = normalizeSuiAddress(addr);
  if (!isValidSuiAddress(normalized)) {
    throw new Error(ChainMessages.DEFAULT_COMPANION_INVALID);
  }
  return normalized;
}

export function getDefaultCompanionAddress(): string {
  return getDefaultCompanion();
}

function resolveDappHubId() {
  return String(process.env.NEXT_PUBLIC_SUI_DAPP_HUB_ID || DAPP_HUB_ID || "");
}

function resolveDappHubInitialSharedVersion() {
  return String(
    process.env.NEXT_PUBLIC_SUI_DAPP_HUB_INITIAL_SHARED_VERSION ||
      DAPP_HUB_INITIAL_SHARED_VERSION ||
      ""
  );
}

function resolvePackageId() {
  return String(process.env.NEXT_PUBLIC_SUI_PACKAGE_ID || PACKAGE_ID || "");
}

function getDappHubSharedRef() {
  const dappHubId = resolveDappHubId();
  if (!dappHubId || dappHubId === "0x0") {
    throw new Error(ChainMessages.CONTRACT_MISSING_HUB_ID);
  }
  const sharedVersion = resolveDappHubInitialSharedVersion();
  if (!sharedVersion || sharedVersion === "0") {
    throw new Error(ChainMessages.CONTRACT_MISSING_HUB_VERSION);
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
    throw new Error(ChainMessages.DAPP_HUB_TYPE_UNREADABLE);
  }
  cachedDubhePackageId = type.split("::")[0];
  return cachedDubhePackageId;
}

function ensurePackageId() {
  const packageId = resolvePackageId();
  if (!packageId || packageId === "0x0") {
    throw new Error(ChainMessages.CONTRACT_MISSING_PACKAGE);
  }
}

function toChainAmount(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(ChainMessages.AMOUNT_INVALID);
  }
  return String(Math.round(n * 100));
}

function ensureOrderId(orderId: string) {
  if (!/^[0-9]+$/.test(orderId)) {
    throw new Error(ChainMessages.ORDER_ID_MUST_BE_NUMERIC);
  }
}

function strip0x(value: string) {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function normalizeDappKey(value: string) {
  return strip0x(value.trim().toLowerCase());
}

type ParsedStoreEvent = {
  dapp_key?: string;
  account?: string;
  table_id?: string;
  key_tuple?: number[][];
  value_tuple?: number[][];
  key?: number[][];
  value?: number[][];
};

function decodeTableIdFromKeyTuple(keyTuple: number[][]): string | null {
  if (!Array.isArray(keyTuple) || keyTuple.length === 0) return null;
  const head = keyTuple[0];
  if (!Array.isArray(head)) return null;
  try {
    return new TextDecoder().decode(Uint8Array.from(head));
  } catch {
    return null;
  }
}

function resolveKeyTuple(parsed: ParsedStoreEvent): number[][] {
  if (Array.isArray(parsed.key_tuple)) return parsed.key_tuple;
  if (Array.isArray(parsed.key)) return parsed.key;
  return [];
}

function resolveValueTuple(parsed: ParsedStoreEvent): number[][] {
  if (Array.isArray(parsed.value_tuple)) return parsed.value_tuple;
  if (Array.isArray(parsed.value)) return parsed.value;
  return [];
}

function resolveTableId(parsed: ParsedStoreEvent | null): string | null {
  if (!parsed) return null;
  if (parsed.table_id) return parsed.table_id;
  return decodeTableIdFromKeyTuple(resolveKeyTuple(parsed));
}

function normalizeKeyTupleForDecode(parsed: ParsedStoreEvent, tableId: string | null): number[][] {
  const raw = resolveKeyTuple(parsed);
  if (!raw.length) return raw;
  if (parsed.table_id) return raw;
  const inferred = decodeTableIdFromKeyTuple(raw);
  if (inferred && (!tableId || inferred === tableId)) {
    return raw.slice(1);
  }
  return raw;
}

function normalizePackageId(value: string | undefined) {
  if (!value) return "";
  try {
    return normalizeSuiAddress(value);
  } catch {
    return "";
  }
}

function matchesTargetEvent(
  eventPackageId: string | undefined,
  parsed: ParsedStoreEvent,
  targetKey: string,
  pkg: string
) {
  const eventPkg = normalizePackageId(eventPackageId);
  const pkgNormalized = normalizePackageId(pkg);
  const matchesPackage = Boolean(eventPkg && pkgNormalized && eventPkg === pkgNormalized);
  const dappKey = normalizeDappKey(parsed.dapp_key || "");
  const accountKey = normalizeDappKey(parsed.account || "");
  const matchesDappKey = dappKey === targetKey || accountKey === targetKey;
  return matchesPackage || matchesDappKey;
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
    signal: AbortSignal.timeout(30_000),
  });
  const prepareData = await prepareRes.json().catch(() => ({}));
  if (!prepareRes.ok) {
    throw new Error(prepareData?.error || ChainMessages.SPONSOR_BUILD_FAILED);
  }
  const txBytes = prepareData?.bytes;
  if (!txBytes || typeof txBytes !== "string") {
    throw new Error(ChainMessages.SPONSOR_INVALID_RESPONSE);
  }
  const userSignature = await signer.signTransaction(fromBase64(txBytes));
  const signature =
    typeof userSignature.signature === "string"
      ? userSignature.signature
      : toBase64(userSignature.signature);
  const execRes = await fetch("/api/chain/sponsor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      step: "execute",
      txBytes,
      userSignature: signature,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const execData = await execRes.json().catch(() => ({}));
  if (!execRes.ok) {
    throw new Error(execData?.error || ChainMessages.SPONSOR_EXEC_FAILED);
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

  const withRetry = async <T>(fn: () => Promise<T>, attempts = 3): Promise<T> => {
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
      throw new Error(result.effects?.status?.error || ChainMessages.TX_FAILED);
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

export function getChainDebugInfo() {
  return {
    packageId: resolvePackageId(),
    dappHubId: resolveDappHubId(),
    dappHubInitialSharedVersion: resolveDappHubInitialSharedVersion(),
    rawPackageId: PACKAGE_ID,
    rawDappHubId: DAPP_HUB_ID,
    rawDappHubInitialSharedVersion: DAPP_HUB_INITIAL_SHARED_VERSION,
    network: process.env.NEXT_PUBLIC_SUI_NETWORK || "",
    rpcUrl: process.env.NEXT_PUBLIC_SUI_RPC_URL || "",
    chainOrdersEnabled: isChainOrdersEnabled(),
    sponsorMode: CHAIN_SPONSOR_MODE,
    ruleSetId: getRuleSetId(),
    defaultCompanion: getDefaultCompanion(),
  };
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
  const serviceFee = params.rawAmount
    ? String(Math.round(params.serviceFee))
    : toChainAmount(params.serviceFee);
  const deposit = params.rawAmount
    ? String(Math.round(params.deposit ?? 0))
    : toChainAmount(params.deposit ?? 0);

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
      throw new Error(ChainMessages.CONTRACT_MISSING_HUB_ID);
    }
    const client = new SuiClient({ url: getRpcUrl() });
    const dubhePackageId = await getDubhePackageId(client);
    const eventType = `${dubhePackageId}::dubhe_events::Dubhe_Store_SetRecord`;
    const pkg = resolvePackageId();
    const targetKey = normalizeDappKey(`${strip0x(pkg)}::dapp_key::DappKey`);
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
        const parsed = event.parsedJson as ParsedStoreEvent | null;
        const tableId = resolveTableId(parsed);
        if (!parsed || tableId !== "order") continue;
        if (!matchesTargetEvent(event.packageId, parsed, targetKey, pkg)) continue;
        const order = decodeOrderFromTuple(
          normalizeKeyTupleForDecode(parsed, tableId),
          resolveValueTuple(parsed)
        );
        if (!order || orders.has(order.orderId)) continue;
        order.lastUpdatedMs = Number(event.timestampMs || 0);
        orders.set(order.orderId, order);
      }
      remaining -= page.data.length;
      if (!page.hasNextPage) break;
      cursor = page.nextCursor ?? null;
    }

    const result = Array.from(orders.values()).sort(
      (a, b) => Number(b.createdAt) - Number(a.createdAt)
    );
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

/**
 * Fetch a single chain order by orderId using devInspectTransactionBlock.
 * Precise on-chain read — no event scanning, no truncation.
 * Returns null if the order doesn't exist on chain or RPC fails.
 */
export async function fetchChainOrderById(orderId: string): Promise<ChainOrder | null> {
  if (isVisualTestMode()) return null;
  ensurePackageId();
  ensureOrderId(orderId);

  const client = new SuiClient({ url: getRpcUrl() });
  const dubhePackageId = await getDubhePackageId(client);
  const dappHubId = String(DAPP_HUB_ID || "");
  if (!dappHubId || dappHubId === "0x0") return null;

  const resourceAccount = `${strip0x(PACKAGE_ID)}::dapp_key::DappKey`;

  const fields = [
    { fn: "get_user", decode: "address" },
    { fn: "get_companion", decode: "address" },
    { fn: "get_rule_set_id", decode: "u64" },
    { fn: "get_service_fee", decode: "u64" },
    { fn: "get_deposit", decode: "u64" },
    { fn: "get_platform_fee_bps", decode: "u64" },
    { fn: "get_status", decode: "u8" },
    { fn: "get_created_at", decode: "u64" },
    { fn: "get_finish_at", decode: "u64" },
    { fn: "get_dispute_deadline", decode: "u64" },
    { fn: "get_vault_service", decode: "u64" },
    { fn: "get_vault_deposit", decode: "u64" },
    { fn: "get_evidence_hash", decode: "vecU8" },
    { fn: "get_dispute_status", decode: "u8" },
    { fn: "get_resolved_by", decode: "address" },
    { fn: "get_resolved_at", decode: "u64" },
  ] as const;

  try {
    const tx = new Transaction();
    for (const f of fields) {
      tx.moveCall({
        target: `${dubhePackageId}::order::${f.fn}`,
        arguments: [tx.object(dappHubId), tx.pure.string(resourceAccount), tx.pure.u64(orderId)],
      });
    }

    const result = await client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: normalizeSuiAddress("0x0"),
    });

    if (result.effects?.status?.status !== "success") return null;
    const results = result.results;
    if (!results || results.length !== fields.length) return null;

    function extractBytes(idx: number): number[] {
      const ret = results![idx]?.returnValues?.[0]?.[0];
      return Array.isArray(ret) ? ret : [];
    }

    const decoders: Record<string, (bytes: number[]) => string | number> = {
      address: (b) => decodeAddress(b),
      u64: (b) => decodeU64(b),
      u8: (b) => decodeU8(b),
      vecU8: (b) => {
        try {
          const raw = bcs.vector(bcs.u8()).parse(Uint8Array.from(b)) as number[];
          return `0x${toHex(Uint8Array.from(raw))}`;
        } catch {
          return "0x";
        }
      },
    };

    const vals = fields.map((f, i) => decoders[f.decode](extractBytes(i)));

    const safeStr = (v: unknown) => (typeof v === "string" ? v : String(v ?? ""));
    const safeNum = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

    return {
      orderId,
      user: safeStr(vals[0]),
      companion: safeStr(vals[1]),
      ruleSetId: safeStr(vals[2]),
      serviceFee: safeStr(vals[3]),
      deposit: safeStr(vals[4]),
      platformFeeBps: safeStr(vals[5]),
      status: safeNum(vals[6]),
      createdAt: safeStr(vals[7]),
      finishAt: safeStr(vals[8]),
      disputeDeadline: safeStr(vals[9]),
      vaultService: safeStr(vals[10]),
      vaultDeposit: safeStr(vals[11]),
      evidenceHash: safeStr(vals[12]),
      disputeStatus: safeNum(vals[13]),
      resolvedBy: safeStr(vals[14]),
      resolvedAt: safeStr(vals[15]),
    };
  } catch {
    return null;
  }
}
