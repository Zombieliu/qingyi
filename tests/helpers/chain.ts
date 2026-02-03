import fs from "node:fs";
import path from "node:path";
import { SuiClient, SuiHTTPTransport, getFullnodeUrl } from "@mysten/sui/client";
import { bcs } from "@mysten/sui/bcs";
import { Transaction, Inputs } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { isValidSuiAddress, normalizeSuiAddress, toHex } from "@mysten/sui/utils";
import { DAPP_HUB_ID, DAPP_HUB_INITIAL_SHARED_VERSION, PACKAGE_ID } from "../../packages/contracts/deployment";

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

type ChainEnv = {
  rpcUrl: string;
  keypair: Ed25519Keypair;
  ruleSetId: string;
  companion: string;
};

const EVENT_LIMIT = Number(process.env.NEXT_PUBLIC_QY_EVENT_LIMIT || "200");
let envLoaded = false;
let cachedEnv: ChainEnv | null = null;
let cachedDubhePackageId: string | null = null;
const rpcLogs: string[] = [];

function logRpc(message: string) {
  if (process.env.E2E_RPC_LOG !== "1") return;
  const line = `[rpc] ${message}`;
  rpcLogs.push(line);
  console.log(line);
}

export function getRpcLogs() {
  return [...rpcLogs];
}

export function resetRpcLogs() {
  rpcLogs.length = 0;
}

function loadEnvFile() {
  if (envLoaded) return;
  envLoaded = true;
  const envPath = path.resolve(__dirname, "../../.env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function ensureChainEnvLoaded() {
  loadEnvFile();
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

function ensurePackageId() {
  if (!PACKAGE_ID || PACKAGE_ID === "0x0") {
    throw new Error("Missing PACKAGE_ID in contracts deployment");
  }
  if (!DAPP_HUB_ID || DAPP_HUB_ID === "0x0") {
    throw new Error("Missing DAPP_HUB_ID in contracts deployment");
  }
  if (!DAPP_HUB_INITIAL_SHARED_VERSION || DAPP_HUB_INITIAL_SHARED_VERSION === "0") {
    throw new Error("Missing DAPP_HUB_INITIAL_SHARED_VERSION in contracts deployment");
  }
}

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SUI_RPC_URL || process.env.SUI_RPC_URL;
  if (explicit) return explicit;
  const network = process.env.NEXT_PUBLIC_SUI_NETWORK || process.env.SUI_NETWORK || "testnet";
  return getFullnodeUrl(network);
}

function getRuleSetId(): string {
  const rule = process.env.NEXT_PUBLIC_QY_RULESET_ID || "1";
  if (!/^[0-9]+$/.test(rule)) {
    throw new Error("NEXT_PUBLIC_QY_RULESET_ID must be numeric");
  }
  return rule;
}

function getCompanion(): string {
  const addr = process.env.NEXT_PUBLIC_QY_DEFAULT_COMPANION || "";
  if (!addr) {
    throw new Error("NEXT_PUBLIC_QY_DEFAULT_COMPANION is required for chain e2e");
  }
  const normalized = normalizeSuiAddress(addr);
  if (!isValidSuiAddress(normalized)) {
    throw new Error("NEXT_PUBLIC_QY_DEFAULT_COMPANION is not a valid Sui address");
  }
  return normalized;
}

function getKeypair(): Ed25519Keypair {
  const secretKey = process.env.E2E_SUI_PRIVATE_KEY || process.env.SUI_ADMIN_PRIVATE_KEY || "";
  if (!secretKey) {
    throw new Error("Missing E2E_SUI_PRIVATE_KEY or SUI_ADMIN_PRIVATE_KEY");
  }
  return Ed25519Keypair.fromSecretKey(secretKey);
}

function getEnv(): ChainEnv {
  if (cachedEnv) return cachedEnv;
  loadEnvFile();
  ensurePackageId();
  cachedEnv = {
    rpcUrl: getRpcUrl(),
    keypair: getKeypair(),
    ruleSetId: getRuleSetId(),
    companion: getCompanion(),
  };
  return cachedEnv;
}

function getClient(): SuiClient {
  const { rpcUrl } = getEnv();
  if (process.env.E2E_RPC_LOG !== "1") {
    return new SuiClient({ url: rpcUrl });
  }
  const transport = new SuiHTTPTransport({
    url: rpcUrl,
    fetch: async (input, init) => {
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
      const paramsText = params ? JSON.stringify(params).slice(0, 500) : "";
      logRpc(`--> ${method} ${paramsText}`);
      const response = await fetch(input, init);
      let errorMessage = "";
      let resultText = "";
      try {
        const cloned = response.clone();
        const json = (await cloned.json()) as { result?: unknown; error?: { message?: string } };
        if (json?.error?.message) {
          errorMessage = json.error.message;
        } else if (process.env.E2E_RPC_LOG_VERBOSE === "1" && json?.result !== undefined) {
          resultText = JSON.stringify(json.result).slice(0, 1000);
        }
      } catch {
        /* ignore */
      }
      const duration = Date.now() - start;
      if (errorMessage) {
        logRpc(`<-- ${method} error ${errorMessage} (${duration}ms)`);
      } else {
        logRpc(`<-- ${method} ${response.status} (${duration}ms)`);
      }
      if (resultText) {
        logRpc(`    result ${resultText}`);
      }
      return response;
    },
  });
  return new SuiClient({ url: rpcUrl, transport });
}

function getDappHubSharedRef() {
  return Inputs.SharedObjectRef({
    objectId: DAPP_HUB_ID,
    initialSharedVersion: BigInt(DAPP_HUB_INITIAL_SHARED_VERSION),
    mutable: true,
  });
}

async function getDubhePackageId(client: SuiClient): Promise<string> {
  if (cachedDubhePackageId) return cachedDubhePackageId;
  const obj = await client.getObject({ id: DAPP_HUB_ID, options: { showType: true } });
  const type = obj.data?.type;
  if (!type) {
    throw new Error("Failed to read DappHub type");
  }
  cachedDubhePackageId = type.split("::")[0];
  return cachedDubhePackageId;
}

function toChainAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Amount must be non-negative");
  }
  return String(Math.round(amount * 100));
}

export function createChainOrderId(): string {
  const now = BigInt(Date.now());
  const rand = BigInt(Math.floor(Math.random() * 1000));
  return (now * 1000n + rand).toString();
}

export function getSignerAddress(): string {
  return getEnv().keypair.getPublicKey().toSuiAddress();
}

export async function createOrderOnChain(params: {
  orderId: string;
  serviceFee: number;
  deposit?: number;
  autoPay?: boolean;
}) {
  const { keypair, ruleSetId, companion } = getEnv();
  const client = getClient();
  const tx = new Transaction();
  const dappHub = getDappHubSharedRef();
  const serviceFee = toChainAmount(params.serviceFee);
  const deposit = toChainAmount(params.deposit ?? 0);

  tx.moveCall({
    target: `${PACKAGE_ID}::order_system::create_order`,
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
      target: `${PACKAGE_ID}::order_system::pay_service_fee`,
      arguments: [tx.object(dappHub), tx.pure.u64(params.orderId)],
    });
  }

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  if (result.effects?.status?.status !== "success") {
    throw new Error(result.effects?.status?.error || "credit balance failed");
  }
  await client.waitForTransaction({ digest: result.digest });
  return { digest: result.digest };
}

export async function payServiceFeeOnChain(orderId: string) {
  const { keypair } = getEnv();
  const client = getClient();
  const tx = new Transaction();
  const dappHub = getDappHubSharedRef();
  tx.moveCall({
    target: `${PACKAGE_ID}::order_system::pay_service_fee`,
    arguments: [tx.object(dappHub), tx.pure.u64(orderId)],
  });
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: result.digest });
  return { digest: result.digest };
}

export async function cancelOrderOnChain(orderId: string) {
  const { keypair } = getEnv();
  const client = getClient();
  const tx = new Transaction();
  const dappHub = getDappHubSharedRef();
  tx.moveCall({
    target: `${PACKAGE_ID}::order_system::cancel_order`,
    arguments: [tx.object(dappHub), tx.pure.u64(orderId)],
  });
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: result.digest });
  return { digest: result.digest };
}

export async function creditBalanceOnChain(params: { user: string; amount: number; receiptId: string }) {
  const { keypair } = getEnv();
  const client = getClient();
  const tx = new Transaction();
  const dappHub = getDappHubSharedRef();
  const amount = toChainAmount(params.amount);
  const receiptBytes = Array.from(new TextEncoder().encode(params.receiptId));
  tx.moveCall({
    target: `${PACKAGE_ID}::ledger_system::credit_balance_with_receipt`,
    arguments: [
      tx.object(dappHub),
      tx.pure.address(params.user),
      tx.pure.u64(amount),
      tx.pure.vector("u8", receiptBytes),
      tx.object("0x6"),
    ],
  });
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: result.digest });
  return { digest: result.digest };
}

export async function fetchOrderById(orderId: string): Promise<ChainOrder | null> {
  ensurePackageId();
  const client = getClient();
  const dubhePackageId = await getDubhePackageId(client);
  const eventType = `${dubhePackageId}::dubhe_events::Dubhe_Store_SetRecord`;
  const targetKey = normalizeDappKey(`${strip0x(PACKAGE_ID)}::dapp_key::DappKey`);

  let cursor: string | null = null;
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
      } catch (err) {
        const message = (err as Error).message || "";
        if (message.includes("429") || message.toLowerCase().includes("too many requests")) {
          attempt += 1;
          if (attempt > 5) throw err;
          await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt));
          continue;
        }
        throw err;
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
      if (!order) continue;
      order.lastUpdatedMs = Number(event.timestampMs || 0);
      if (order.orderId === orderId) return order;
    }
    remaining -= page.data.length;
    if (!page.hasNextPage) break;
    cursor = page.nextCursor ?? null;
  }

  return null;
}

export async function waitForOrderStatus(
  orderId: string,
  status: number,
  options: { timeoutMs?: number; pollMs?: number } = {}
): Promise<ChainOrder> {
  const timeoutMs = options.timeoutMs ?? 90_000;
  const pollMs = options.pollMs ?? 2_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const order = await fetchOrderById(orderId);
    if (order && order.status === status) {
      return order;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Timed out waiting for order ${orderId} to reach status ${status}`);
}
