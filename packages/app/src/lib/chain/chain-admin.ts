import "server-only";
import { SuiClient, getFullnodeUrl, type EventId } from "@mysten/sui/client";
import { bcs } from "@mysten/sui/bcs";
import { Transaction, Inputs } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { isValidSuiAddress, normalizeSuiAddress, toHex } from "@mysten/sui/utils";
import { DAPP_HUB_ID, DAPP_HUB_INITIAL_SHARED_VERSION, PACKAGE_ID } from "contracts/deployment";
import { env } from "@/lib/env";

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

const EVENT_LIMIT = env.ADMIN_CHAIN_EVENT_LIMIT;
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
  const explicit = env.SUI_RPC_URL || env.NEXT_PUBLIC_SUI_RPC_URL;
  if (explicit) return explicit;
  const network = env.SUI_NETWORK;
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
  const key = env.SUI_ADMIN_PRIVATE_KEY;
  if (!key) {
    throw new Error("Missing SUI_ADMIN_PRIVATE_KEY");
  }
  return Ed25519Keypair.fromSecretKey(key);
}

export async function fetchChainOrdersAdmin(): Promise<ChainOrder[]> {
  const result = await fetchChainOrdersAdminInternal();
  return result.orders;
}

type FetchChainOrdersResult = {
  orders: ChainOrder[];
  latestCursor: EventId | null;
  latestEventMs: number | null;
};

async function fetchChainOrdersAdminInternal(options?: {
  cursor?: EventId | null;
  limit?: number;
  order?: "ascending" | "descending";
}): Promise<FetchChainOrdersResult> {
  const { pkg } = ensureChainEnv();
  const client = new SuiClient({ url: getRpcUrl() });
  const dubhePackageId = await getDubhePackageId(client);
  const eventType = `${dubhePackageId}::dubhe_events::Dubhe_Store_SetRecord`;
  const targetKey = normalizeDappKey(`${strip0x(pkg)}::dapp_key::DappKey`);
  const orders = new Map<string, ChainOrder>();
  let cursor: EventId | null = options?.cursor ?? null;
  let remaining = Number.isFinite(options?.limit)
    ? Number(options?.limit)
    : Number.isFinite(EVENT_LIMIT)
      ? EVENT_LIMIT
      : 200;
  const orderDirection = options?.order || "descending";
  let latestCursor: EventId | null = null;
  let latestEventMs: number | null = null;

  while (remaining > 0) {
    let page: Awaited<ReturnType<typeof client.queryEvents>>;
    let attempt = 0;
    while (true) {
      try {
        page = await retryRpc(() =>
          client.queryEvents({
            query: { MoveEventType: eventType },
            limit: Math.min(50, remaining),
            order: orderDirection,
            cursor,
          })
        );
        break;
      } catch (err) {
        attempt += 1;
        if (attempt > 5) throw err;
      }
    }
    if (page.data.length > 0) {
      if (orderDirection === "descending") {
        if (!latestCursor) {
          latestCursor = page.data[0].id ?? null;
          const ts = Number(page.data[0].timestampMs || 0);
          latestEventMs = ts || null;
        }
      } else {
        const lastEvent = page.data[page.data.length - 1];
        latestCursor = lastEvent.id ?? latestCursor;
        const ts = Number(lastEvent.timestampMs || 0);
        if (ts) latestEventMs = ts;
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
      const chainOrder = decodeOrderFromTuple(parsed.key_tuple || [], parsed.value_tuple || []);
      if (!chainOrder) continue;
      chainOrder.lastUpdatedMs = Number(event.timestampMs || 0);
      if (orderDirection === "ascending" || !orders.has(chainOrder.orderId)) {
        orders.set(chainOrder.orderId, chainOrder);
      }
    }
    remaining -= page.data.length;
    if (!page.hasNextPage) break;
    cursor = page.nextCursor ?? null;
  }

  return {
    orders: Array.from(orders.values()).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)),
    latestCursor,
    latestEventMs,
  };
}

export async function fetchChainOrdersAdminWithCursor(options?: {
  cursor?: EventId | null;
  limit?: number;
  order?: "ascending" | "descending";
}): Promise<FetchChainOrdersResult> {
  return fetchChainOrdersAdminInternal(options);
}

type ParsedEvent = {
  type?: string;
  parsedJson?: Record<string, unknown>;
};

function readStringField(obj: Record<string, unknown> | undefined, key: string, fallback = "0") {
  if (!obj) return fallback;
  const value = obj[key];
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function readAddressField(obj: Record<string, unknown> | undefined, key: string) {
  const raw = readStringField(obj, key, "0x0");
  return normalizeSuiAddress(raw);
}

function readHexField(obj: Record<string, unknown> | undefined, key: string) {
  const raw = obj?.[key];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    const bytes = raw.map((value) => Number(value));
    if (bytes.every((value) => Number.isFinite(value))) {
      return `0x${toHex(Uint8Array.from(bytes))}`;
    }
  }
  return "0x";
}

type ChainOrderFallback = {
  orderId?: string;
  user?: string;
  companion?: string;
  ruleSetId?: string;
  serviceFee?: string;
  deposit?: string;
  createdAt?: string;
};

function readOrderIdFromEvent(event: ParsedEvent | undefined) {
  const parsed = event?.parsedJson as Record<string, unknown> | undefined;
  if (!parsed) return "";
  return readStringField(parsed, "order_id", "");
}

export async function findChainOrderFromDigest(
  digest: string,
  fallback?: ChainOrderFallback
): Promise<ChainOrder | null> {
  const { pkg } = ensureChainEnv();
  if (!digest) return null;
  const client = new SuiClient({ url: getRpcUrl() });
  const tx = await retryRpc(() =>
    client.getTransactionBlock({
      digest,
      options: { showEvents: true },
    })
  );
  const events = (tx.events || []) as ParsedEvent[];
  if (!events.length) return null;
  const prefix = `${pkg}::events::`;
  const createdEvent = events.find((event) => event.type === `${prefix}OrderCreated`);
  const claimedEvent = events.find((event) => event.type === `${prefix}OrderClaimed`);
  const paidEvent = events.find((event) => event.type === `${prefix}OrderPaid`);
  const depositEvent = events.find((event) => event.type === `${prefix}DepositLocked`);
  const completedEvent = events.find((event) => event.type === `${prefix}OrderCompleted`);
  const disputedEvent = events.find((event) => event.type === `${prefix}OrderDisputed`);
  const resolvedEvent = events.find((event) => event.type === `${prefix}OrderResolved`);
  const finalizedEvent = events.find((event) => event.type === `${prefix}OrderFinalized`);
  const hasOrderEvent = Boolean(
    createdEvent ||
    claimedEvent ||
    paidEvent ||
    depositEvent ||
    completedEvent ||
    disputedEvent ||
    resolvedEvent ||
    finalizedEvent
  );
  if (!hasOrderEvent) return null;

  const created = createdEvent?.parsedJson as Record<string, unknown> | undefined;
  const claimed = claimedEvent?.parsedJson as Record<string, unknown> | undefined;
  const paid = paidEvent?.parsedJson as Record<string, unknown> | undefined;
  const depositLocked = depositEvent?.parsedJson as Record<string, unknown> | undefined;
  const completed = completedEvent?.parsedJson as Record<string, unknown> | undefined;
  const disputed = disputedEvent?.parsedJson as Record<string, unknown> | undefined;
  const resolved = resolvedEvent?.parsedJson as Record<string, unknown> | undefined;
  const finalized = finalizedEvent?.parsedJson as Record<string, unknown> | undefined;
  const orderId =
    readStringField(created, "order_id", "") ||
    readOrderIdFromEvent(claimedEvent) ||
    readOrderIdFromEvent(paidEvent) ||
    readOrderIdFromEvent(depositEvent) ||
    readOrderIdFromEvent(completedEvent) ||
    readOrderIdFromEvent(disputedEvent) ||
    readOrderIdFromEvent(resolvedEvent) ||
    readOrderIdFromEvent(finalizedEvent) ||
    fallback?.orderId ||
    "";
  if (!orderId) return null;

  const serviceFee =
    readStringField(created, "service_fee", "") ||
    readStringField(paid, "service_fee", "") ||
    readStringField(depositLocked, "service_fee", "") ||
    fallback?.serviceFee ||
    "0";
  const deposit =
    readStringField(created, "deposit", "") ||
    readStringField(depositLocked, "deposit", "") ||
    fallback?.deposit ||
    "0";
  const user = created
    ? readAddressField(created, "user")
    : paid
      ? readAddressField(paid, "user")
      : completed
        ? readAddressField(completed, "user")
        : fallback?.user
          ? normalizeSuiAddress(fallback.user)
          : "0x0";
  const companion = created
    ? readAddressField(created, "companion")
    : claimed
      ? readAddressField(claimed, "companion")
      : depositLocked
        ? readAddressField(depositLocked, "companion")
        : fallback?.companion
          ? normalizeSuiAddress(fallback.companion)
          : "0x0";
  const ruleSetId = readStringField(created, "rule_set_id", "") || fallback?.ruleSetId || "0";
  const chain: ChainOrder = {
    orderId,
    user,
    companion,
    ruleSetId,
    serviceFee,
    deposit,
    platformFeeBps: "0",
    status: 0,
    createdAt: fallback?.createdAt || String(tx.timestampMs || Date.now()),
    finishAt: "0",
    disputeDeadline: "0",
    vaultService: "0",
    vaultDeposit: "0",
    evidenceHash: "0x",
    disputeStatus: 0,
    resolvedBy: "0x0",
    resolvedAt: "0",
  };

  if (paid) {
    chain.status = 1;
    chain.vaultService = serviceFee;
  }
  if (depositLocked) {
    chain.status = 2;
    chain.vaultService = serviceFee;
    chain.vaultDeposit = deposit;
  }
  if (completed) {
    chain.status = 3;
    chain.finishAt = readStringField(completed, "finish_at", "0");
    chain.disputeDeadline = readStringField(completed, "dispute_deadline", "0");
    chain.vaultService = serviceFee;
    chain.vaultDeposit = depositLocked ? deposit : "0";
  }
  if (disputed) {
    chain.status = 4;
    chain.disputeStatus = 1;
    chain.evidenceHash = readHexField(disputed, "evidence_hash");
  }
  if (resolved) {
    chain.status = 5;
    chain.disputeStatus = 2;
    chain.resolvedBy = readAddressField(resolved, "resolved_by");
    chain.resolvedAt = String(tx.timestampMs || 0);
    chain.vaultService = "0";
    chain.vaultDeposit = "0";
  }
  if (finalized) {
    chain.status = 5;
    chain.vaultService = "0";
    chain.vaultDeposit = "0";
  }

  return chain;
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
