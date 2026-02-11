import "server-only";
import { SuiClient, getFullnodeUrl, type EventId } from "@mysten/sui/client";
import { bcs } from "@mysten/sui/bcs";
import { Transaction, Inputs } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { isValidSuiAddress, normalizeSuiAddress, toHex } from "@mysten/sui/utils";
import { DAPP_HUB_ID, DAPP_HUB_INITIAL_SHARED_VERSION, PACKAGE_ID } from "contracts/deployment";

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

const EVENT_LIMIT = Number(process.env.ADMIN_CHAIN_EVENT_LIMIT || process.env.NEXT_PUBLIC_QY_EVENT_LIMIT || "1000");
const RETRYABLE_RPC_PATTERNS = [
  "429",
  "too many requests",
  "fetch failed",
  "timeout",
  "socket",
  "connect timeout",
];

function strip0x(value: string) {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function normalizeDappKey(value: string) {
  return strip0x(value.trim().toLowerCase());
}

function isRetryableRpcError(message: string) {
  const lower = message.toLowerCase();
  return RETRYABLE_RPC_PATTERNS.some((pattern) => lower.includes(pattern));
}

async function retryRpc<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; maxDelayMs?: number } = {}
): Promise<T> {
  const attempts = options.attempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 800;
  const maxDelayMs = options.maxDelayMs ?? 8_000;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt >= attempts - 1) break;
      const message = lastError.message || "";
      if (!isRetryableRpcError(message)) break;
      const delay = Math.min(baseDelayMs * (attempt + 1), maxDelayMs);
      const jitter = Math.floor(Math.random() * 250);
      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
    }
  }
  throw lastError || new Error("rpc failed");
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

function ensureChainEnv() {
  const pkg = String(PACKAGE_ID || "");
  const hubId = String(DAPP_HUB_ID || "");
  const hubVer = String(DAPP_HUB_INITIAL_SHARED_VERSION || "");
  if (!pkg || pkg === "0x0") {
    throw new Error("Missing PACKAGE_ID in contracts deployment");
  }
  if (!hubId || hubId === "0x0") {
    throw new Error("Missing DAPP_HUB_ID in contracts deployment");
  }
  if (!hubVer || hubVer === "0") {
    throw new Error("Missing DAPP_HUB_INITIAL_SHARED_VERSION in contracts deployment");
  }
  return { pkg, hubId, hubVer };
}

function getRpcUrl(): string {
  const explicit = process.env.SUI_RPC_URL || process.env.NEXT_PUBLIC_SUI_RPC_URL;
  if (explicit) return explicit;
  const network = process.env.SUI_NETWORK || process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet";
  return getFullnodeUrl(network as "testnet" | "mainnet" | "devnet" | "localnet");
}

async function getDubhePackageId(client: SuiClient): Promise<string> {
  const { hubId } = ensureChainEnv();
  const obj = await retryRpc(() => client.getObject({ id: hubId, options: { showType: true } }));
  const type = obj.data?.type;
  if (!type) throw new Error("无法读取 DappHub 类型");
  return type.split("::")[0];
}

function getAdminSigner() {
  const key = process.env.SUI_ADMIN_PRIVATE_KEY;
  if (!key) {
    throw new Error("Missing SUI_ADMIN_PRIVATE_KEY");
  }
  return Ed25519Keypair.fromSecretKey(key);
}

export async function fetchChainOrdersAdmin(): Promise<ChainOrder[]> {
  const { pkg } = ensureChainEnv();
  const client = new SuiClient({ url: getRpcUrl() });
  const dubhePackageId = await getDubhePackageId(client);
  const eventType = `${dubhePackageId}::dubhe_events::Dubhe_Store_SetRecord`;
  const targetKey = normalizeDappKey(`${strip0x(pkg)}::dapp_key::DappKey`);
  const orders = new Map<string, ChainOrder>();
  let cursor: EventId | null = null;
  let remaining = Number.isFinite(EVENT_LIMIT) ? EVENT_LIMIT : 200;

  while (remaining > 0) {
    let page: Awaited<ReturnType<typeof client.queryEvents>>;
    let attempt = 0;
    while (true) {
      try {
        page = await retryRpc(() =>
          client.queryEvents({
            query: { MoveEventType: eventType },
            limit: Math.min(50, remaining),
            order: "descending",
            cursor,
          })
        );
        break;
      } catch (err) {
        attempt += 1;
        if (attempt > 5) throw err;
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

  return Array.from(orders.values()).sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}

export async function resolveDisputeAdmin(params: {
  orderId: string;
  serviceRefundBps: number;
  depositSlashBps: number;
}) {
  const { pkg, hubId, hubVer } = ensureChainEnv();
  const signer = getAdminSigner();
  const client = new SuiClient({ url: getRpcUrl() });

  if (!/^[0-9]+$/.test(params.orderId)) {
    throw new Error("orderId must be numeric string");
  }
  if (params.serviceRefundBps < 0 || params.serviceRefundBps > 10000) {
    throw new Error("serviceRefundBps out of range");
  }
  if (params.depositSlashBps < 0 || params.depositSlashBps > 10000) {
    throw new Error("depositSlashBps out of range");
  }

  const tx = new Transaction();
  const dappHub = Inputs.SharedObjectRef({
    objectId: hubId,
    initialSharedVersion: hubVer,
    mutable: true,
  });
  tx.moveCall({
    target: `${pkg}::order_system::resolve_dispute`,
    arguments: [
      tx.object(dappHub),
      tx.pure.u64(params.orderId),
      tx.pure.u64(params.serviceRefundBps),
      tx.pure.u64(params.depositSlashBps),
      tx.object("0x6"),
    ],
  });

  const result = await retryRpc(() =>
    client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: { showEffects: true },
    })
  );

  return { digest: result.digest, effects: result.effects };
}

export async function cancelOrderAdmin(orderId: string) {
  const { pkg, hubId, hubVer } = ensureChainEnv();
  const signer = getAdminSigner();
  const client = new SuiClient({ url: getRpcUrl() });

  if (!/^[0-9]+$/.test(orderId)) {
    throw new Error("orderId must be numeric string");
  }

  const tx = new Transaction();
  const dappHub = Inputs.SharedObjectRef({
    objectId: hubId,
    initialSharedVersion: hubVer,
    mutable: true,
  });
  tx.moveCall({
    target: `${pkg}::order_system::admin_cancel_order`,
    arguments: [tx.object(dappHub), tx.pure.u64(orderId)],
  });

  const result = await retryRpc(() =>
    client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: { showEffects: true },
    })
  );

  return { digest: result.digest, effects: result.effects };
}

export async function markCompletedAdmin(orderId: string) {
  const { pkg, hubId, hubVer } = ensureChainEnv();
  const signer = getAdminSigner();
  const client = new SuiClient({ url: getRpcUrl() });

  if (!/^[0-9]+$/.test(orderId)) {
    throw new Error("orderId must be numeric string");
  }

  const tx = new Transaction();
  const dappHub = Inputs.SharedObjectRef({
    objectId: hubId,
    initialSharedVersion: hubVer,
    mutable: true,
  });
  tx.moveCall({
    target: `${pkg}::order_system::admin_mark_completed`,
    arguments: [tx.object(dappHub), tx.pure.u64(orderId), tx.object("0x6")],
  });

  const result = await retryRpc(() =>
    client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: { showEffects: true },
    })
  );

  return { digest: result.digest, effects: result.effects };
}

export async function finalizeNoDisputeAdmin(orderId: string) {
  const { pkg, hubId, hubVer } = ensureChainEnv();
  const signer = getAdminSigner();
  const client = new SuiClient({ url: getRpcUrl() });

  if (!/^[0-9]+$/.test(orderId)) {
    throw new Error("orderId must be numeric string");
  }

  const tx = new Transaction();
  const dappHub = Inputs.SharedObjectRef({
    objectId: hubId,
    initialSharedVersion: hubVer,
    mutable: true,
  });
  tx.moveCall({
    target: `${pkg}::order_system::finalize_no_dispute`,
    arguments: [tx.object(dappHub), tx.pure.u64(orderId), tx.object("0x6")],
  });

  const result = await retryRpc(() =>
    client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: { showEffects: true },
    })
  );

  return { digest: result.digest, effects: result.effects };
}

export function validateCompanionAddress(address: string) {
  const normalized = normalizeSuiAddress(address);
  if (!isValidSuiAddress(normalized)) {
    throw new Error("invalid address");
  }
  return normalized;
}
