import "server-only";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction, Inputs } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { DAPP_HUB_ID, DAPP_HUB_INITIAL_SHARED_VERSION, PACKAGE_ID } from "contracts/deployment";
import { env } from "@/lib/env";

function ensureChainEnv() {
  const pkg = String(PACKAGE_ID || "");
  const hubId = String(DAPP_HUB_ID || "");
  const hubVer = String(DAPP_HUB_INITIAL_SHARED_VERSION || "");
  if (!pkg || pkg === "0x0") throw new Error("Missing PACKAGE_ID");
  if (!hubId || hubId === "0x0") throw new Error("Missing DAPP_HUB_ID");
  if (!hubVer || hubVer === "0") throw new Error("Missing DAPP_HUB_INITIAL_SHARED_VERSION");
  return { pkg, hubId, hubVer };
}

function getRpcUrl(): string {
  const explicit = env.SUI_RPC_URL || env.NEXT_PUBLIC_SUI_RPC_URL;
  if (explicit) return explicit;
  const network = env.SUI_NETWORK;
  return getFullnodeUrl(network as "testnet" | "mainnet" | "devnet" | "localnet");
}

function getAdminSigner() {
  const key = env.SUI_ADMIN_PRIVATE_KEY;
  if (!key) throw new Error("Missing SUI_ADMIN_PRIVATE_KEY");
  return Ed25519Keypair.fromSecretKey(key);
}

async function retryRpc<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e as Error;
      if (i >= attempts - 1) break;
      if (!/429|too many requests|fetch failed|timeout|socket/i.test(lastError.message || ""))
        break;
      await new Promise((r) => setTimeout(r, 800 * (i + 1) + Math.random() * 250));
    }
  }
  throw lastError || new Error("rpc failed");
}
export async function markDuoCompletedAdmin(orderId: string) {
  const { pkg, hubId, hubVer } = ensureChainEnv();
  const signer = getAdminSigner();
  const client = new SuiClient({ url: getRpcUrl() });
  if (!/^[0-9]+$/.test(orderId)) throw new Error("orderId must be numeric string");

  const tx = new Transaction();
  const dappHub = Inputs.SharedObjectRef({
    objectId: hubId,
    initialSharedVersion: hubVer,
    mutable: true,
  });
  tx.moveCall({
    target: `${pkg}::duo_order_system::admin_mark_completed`,
    arguments: [tx.object(dappHub), tx.pure.u64(orderId), tx.object("0x6")],
  });
  const result = await retryRpc(() =>
    client.signAndExecuteTransaction({ signer, transaction: tx, options: { showEffects: true } })
  );
  return { digest: result.digest, effects: result.effects };
}

export async function cancelDuoOrderAdmin(orderId: string) {
  const { pkg, hubId, hubVer } = ensureChainEnv();
  const signer = getAdminSigner();
  const client = new SuiClient({ url: getRpcUrl() });
  if (!/^[0-9]+$/.test(orderId)) throw new Error("orderId must be numeric string");

  const tx = new Transaction();
  const dappHub = Inputs.SharedObjectRef({
    objectId: hubId,
    initialSharedVersion: hubVer,
    mutable: true,
  });
  tx.moveCall({
    target: `${pkg}::duo_order_system::admin_cancel_order`,
    arguments: [tx.object(dappHub), tx.pure.u64(orderId)],
  });
  const result = await retryRpc(() =>
    client.signAndExecuteTransaction({ signer, transaction: tx, options: { showEffects: true } })
  );
  return { digest: result.digest, effects: result.effects };
}

export async function finalizeDuoNoDisputeAdmin(orderId: string) {
  const { pkg, hubId, hubVer } = ensureChainEnv();
  const signer = getAdminSigner();
  const client = new SuiClient({ url: getRpcUrl() });
  if (!/^[0-9]+$/.test(orderId)) throw new Error("orderId must be numeric string");

  const tx = new Transaction();
  const dappHub = Inputs.SharedObjectRef({
    objectId: hubId,
    initialSharedVersion: hubVer,
    mutable: true,
  });
  tx.moveCall({
    target: `${pkg}::duo_order_system::finalize_no_dispute`,
    arguments: [tx.object(dappHub), tx.pure.u64(orderId), tx.object("0x6")],
  });
  const result = await retryRpc(() =>
    client.signAndExecuteTransaction({ signer, transaction: tx, options: { showEffects: true } })
  );
  return { digest: result.digest, effects: result.effects };
}

export async function adminReleaseDuoSlot(params: {
  orderId: string;
  slot: number;
  newCompanion?: string;
}) {
  const { pkg, hubId, hubVer } = ensureChainEnv();
  const signer = getAdminSigner();
  const client = new SuiClient({ url: getRpcUrl() });
  if (!/^[0-9]+$/.test(params.orderId)) throw new Error("orderId must be numeric string");
  if (params.slot !== 0 && params.slot !== 1) throw new Error("slot must be 0 or 1");

  const newCompanion =
    params.newCompanion || "0x0000000000000000000000000000000000000000000000000000000000000000";

  const tx = new Transaction();
  const dappHub = Inputs.SharedObjectRef({
    objectId: hubId,
    initialSharedVersion: hubVer,
    mutable: true,
  });
  tx.moveCall({
    target: `${pkg}::duo_order_system::admin_release_slot`,
    arguments: [
      tx.object(dappHub),
      tx.pure.u64(params.orderId),
      tx.pure.u8(params.slot),
      tx.pure.address(newCompanion),
    ],
  });
  const result = await retryRpc(() =>
    client.signAndExecuteTransaction({ signer, transaction: tx, options: { showEffects: true } })
  );
  return { digest: result.digest, effects: result.effects };
}

export async function resolveDuoDisputeAdmin(params: {
  orderId: string;
  serviceRefundBps: number;
  depositSlashBps: number;
}) {
  const { pkg, hubId, hubVer } = ensureChainEnv();
  const signer = getAdminSigner();
  const client = new SuiClient({ url: getRpcUrl() });
  if (!/^[0-9]+$/.test(params.orderId)) throw new Error("orderId must be numeric string");
  if (params.serviceRefundBps < 0 || params.serviceRefundBps > 10000)
    throw new Error("serviceRefundBps out of range");
  if (params.depositSlashBps < 0 || params.depositSlashBps > 10000)
    throw new Error("depositSlashBps out of range");

  const tx = new Transaction();
  const dappHub = Inputs.SharedObjectRef({
    objectId: hubId,
    initialSharedVersion: hubVer,
    mutable: true,
  });
  tx.moveCall({
    target: `${pkg}::duo_order_system::resolve_dispute`,
    arguments: [
      tx.object(dappHub),
      tx.pure.u64(params.orderId),
      tx.pure.u64(params.serviceRefundBps),
      tx.pure.u64(params.depositSlashBps),
      tx.object("0x6"),
    ],
  });
  const result = await retryRpc(() =>
    client.signAndExecuteTransaction({ signer, transaction: tx, options: { showEffects: true } })
  );
  return { digest: result.digest, effects: result.effects };
}
