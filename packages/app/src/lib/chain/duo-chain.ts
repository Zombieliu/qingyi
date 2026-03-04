"use client";

import { Transaction, Inputs } from "@mysten/sui/transactions";
import { DAPP_HUB_ID, DAPP_HUB_INITIAL_SHARED_VERSION, PACKAGE_ID } from "contracts/deployment";
import { getStoredWallet, createChainOrderId } from "./qy-chain-lite";

export { createChainOrderId };

export type DuoChainOrder = {
  orderId: string;
  user: string;
  companionA: string;
  companionB: string;
  ruleSetId: string;
  serviceFee: string;
  depositPerCompanion: string;
  platformFeeBps: string;
  status: number;
  teamStatus: number;
  createdAt: string;
  finishAt: string;
  disputeDeadline: string;
  vaultService: string;
  vaultDepositA: string;
  vaultDepositB: string;
  evidenceHash: string;
  disputeStatus: number;
  resolvedBy: string;
  resolvedAt: string;
};
import { ChainMessages } from "@/lib/shared/messages";
import {
  PasskeyKeypair,
  BrowserPasskeyProvider,
  type BrowserPasswordProviderOptions,
} from "@mysten/sui/keypairs/passkey";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { fromBase64, normalizeSuiAddress, toBase64 } from "@mysten/sui/utils";
import { getChainSponsorPolicy } from "./chain-sponsor-mode";

const CHAIN_SPONSOR_POLICY = getChainSponsorPolicy(process.env.NEXT_PUBLIC_CHAIN_SPONSOR);

function isSponsorEnabled() {
  return CHAIN_SPONSOR_POLICY.enabled;
}

function isSponsorStrict() {
  return CHAIN_SPONSOR_POLICY.strict;
}

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SUI_RPC_URL;
  if (explicit) return explicit;
  const network = (process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet") as
    | "testnet"
    | "mainnet"
    | "devnet"
    | "localnet";
  return getFullnodeUrl(network);
}

function resolvePackageId() {
  return String(process.env.NEXT_PUBLIC_SUI_PACKAGE_ID || PACKAGE_ID || "");
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

function getDappHubSharedRef() {
  const dappHubId = resolveDappHubId();
  if (!dappHubId || dappHubId === "0x0") throw new Error(ChainMessages.CONTRACT_MISSING_HUB_ID);
  const sharedVersion = resolveDappHubInitialSharedVersion();
  if (!sharedVersion || sharedVersion === "0")
    throw new Error(ChainMessages.CONTRACT_MISSING_HUB_VERSION);
  return Inputs.SharedObjectRef({
    objectId: dappHubId,
    initialSharedVersion: sharedVersion,
    mutable: true,
  });
}

function ensurePackageId() {
  const packageId = resolvePackageId();
  if (!packageId || packageId === "0x0") throw new Error(ChainMessages.CONTRACT_MISSING_PACKAGE);
}

function toChainAmount(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n) || n < 0) throw new Error(ChainMessages.AMOUNT_INVALID);
  return String(Math.round(n * 100));
}

function ensureOrderId(orderId: string) {
  if (!/^[0-9]+$/.test(orderId)) throw new Error(ChainMessages.ORDER_ID_MUST_BE_NUMERIC);
}

function getRuleSetId(): string {
  return process.env.NEXT_PUBLIC_QY_RULESET_ID || "1";
}

function getProviderOptions(): BrowserPasswordProviderOptions {
  return {
    rp: { id: typeof window !== "undefined" ? window.location.hostname : undefined },
    authenticatorSelection: {
      authenticatorAttachment:
        process.env.NEXT_PUBLIC_PASSKEY_AUTOMATION === "1" ? "cross-platform" : "platform",
      residentKey: "preferred",
      requireResidentKey: false,
      userVerification: "preferred",
    },
  };
}

function getSignerAndClient() {
  const wallet = getStoredWallet();
  const provider = new BrowserPasskeyProvider("青衣", getProviderOptions());
  const signer = new PasskeyKeypair(fromBase64(wallet.publicKey), provider);
  const client = new SuiClient({ url: getRpcUrl() });
  return { signer, client, wallet };
}

async function executeSponsoredTransaction(tx: Transaction) {
  const { signer, wallet } = getSignerAndClient();
  const client = new SuiClient({ url: getRpcUrl() });
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
  if (!prepareRes.ok) throw new Error(prepareData?.error || ChainMessages.SPONSOR_BUILD_FAILED);
  const txBytes = prepareData?.bytes;
  if (!txBytes || typeof txBytes !== "string")
    throw new Error(ChainMessages.SPONSOR_INVALID_RESPONSE);
  const userSignature = await signer.signTransaction(fromBase64(txBytes));
  const signature =
    typeof userSignature.signature === "string"
      ? userSignature.signature
      : toBase64(userSignature.signature);
  const execRes = await fetch("/api/chain/sponsor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step: "execute", txBytes, userSignature: signature }),
    signal: AbortSignal.timeout(30_000),
  });
  const execData = await execRes.json().catch(() => ({}));
  if (!execRes.ok) throw new Error(execData?.error || ChainMessages.SPONSOR_EXEC_FAILED);
  return { digest: execData?.digest as string };
}

async function executeTransaction(tx: Transaction) {
  const withRetry = async <T>(fn: () => Promise<T>, attempts = 3): Promise<T> => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        const msg = lastError.message || "";
        if (
          attempt < attempts - 1 &&
          /429|too many requests|timeout|fetch failed|socket/i.test(msg)
        ) {
          await new Promise((r) => setTimeout(r, 800 + attempt * 800));
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
    if (result.effects?.status?.status && result.effects.status.status !== "success") {
      throw new Error(result.effects?.status?.error || ChainMessages.TX_FAILED);
    }
    return { digest: result.digest };
  };

  if (!isSponsorEnabled()) return withRetry(directExecute);
  try {
    return await withRetry(() => executeSponsoredTransaction(tx));
  } catch (error) {
    if (isSponsorStrict()) throw error;
    return withRetry(directExecute);
  }
}

export async function createDuoOrderOnChain(params: {
  orderId: string;
  serviceFee: number;
  depositPerCompanion?: number;
  ruleSetId?: string;
  companionA?: string;
  companionB?: string;
  autoPay?: boolean;
  rawAmount?: boolean;
}) {
  ensurePackageId();
  ensureOrderId(params.orderId);
  const ruleSetId = params.ruleSetId ?? getRuleSetId();
  const companionA = params.companionA
    ? normalizeSuiAddress(params.companionA)
    : normalizeSuiAddress("0x0");
  const companionB = params.companionB
    ? normalizeSuiAddress(params.companionB)
    : normalizeSuiAddress("0x0");
  const serviceFee = params.rawAmount
    ? String(Math.round(params.serviceFee))
    : toChainAmount(params.serviceFee);
  const deposit = params.rawAmount
    ? String(Math.round(params.depositPerCompanion ?? 0))
    : toChainAmount(params.depositPerCompanion ?? 0);

  const tx = new Transaction();
  const dappHub = getDappHubSharedRef();
  tx.moveCall({
    target: PACKAGE_ID + "::duo_order_system::create_duo_order",
    arguments: [
      tx.object(dappHub),
      tx.pure.u64(params.orderId),
      tx.pure.address(companionA),
      tx.pure.address(companionB),
      tx.pure.u64(ruleSetId),
      tx.pure.u64(serviceFee),
      tx.pure.u64(deposit),
      tx.object("0x6"),
    ],
  });
  if (params.autoPay) {
    tx.moveCall({
      target: PACKAGE_ID + "::duo_order_system::pay_service_fee",
      arguments: [tx.object(dappHub), tx.pure.u64(params.orderId)],
    });
  }
  return executeTransaction(tx);
}

export async function claimDuoSlotOnChain(orderId: string) {
  ensurePackageId();
  ensureOrderId(orderId);
  const tx = new Transaction();
  const dappHub = getDappHubSharedRef();
  tx.moveCall({
    target: PACKAGE_ID + "::duo_order_system::claim_slot",
    arguments: [tx.object(dappHub), tx.pure.u64(orderId)],
  });
  return executeTransaction(tx);
}

export async function lockDuoDepositOnChain(orderId: string) {
  ensurePackageId();
  ensureOrderId(orderId);
  const tx = new Transaction();
  const dappHub = getDappHubSharedRef();
  tx.moveCall({
    target: PACKAGE_ID + "::duo_order_system::lock_deposit",
    arguments: [tx.object(dappHub), tx.pure.u64(orderId)],
  });
  return executeTransaction(tx);
}

export async function markDuoCompletedOnChain(orderId: string) {
  ensurePackageId();
  ensureOrderId(orderId);
  const tx = new Transaction();
  const dappHub = getDappHubSharedRef();
  tx.moveCall({
    target: PACKAGE_ID + "::duo_order_system::mark_completed",
    arguments: [tx.object(dappHub), tx.pure.u64(orderId), tx.object("0x6")],
  });
  return executeTransaction(tx);
}

export async function cancelDuoOrderOnChain(orderId: string) {
  ensurePackageId();
  ensureOrderId(orderId);
  const tx = new Transaction();
  const dappHub = getDappHubSharedRef();
  tx.moveCall({
    target: PACKAGE_ID + "::duo_order_system::cancel_order",
    arguments: [tx.object(dappHub), tx.pure.u64(orderId)],
  });
  return executeTransaction(tx);
}

export async function releaseDuoSlotOnChain(orderId: string) {
  ensurePackageId();
  ensureOrderId(orderId);
  const tx = new Transaction();
  const dappHub = getDappHubSharedRef();
  tx.moveCall({
    target: PACKAGE_ID + "::duo_order_system::release_slot",
    arguments: [tx.object(dappHub), tx.pure.u64(orderId)],
  });
  return executeTransaction(tx);
}
