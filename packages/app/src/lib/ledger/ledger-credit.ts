import "server-only";
import {
  Dubhe,
  Transaction,
  type NetworkType,
  type SuiMoveNormalizedModules,
} from "@0xobelisk/sui-client";
import { Inputs } from "@mysten/sui/transactions";
import contractMetadata from "contracts/metadata.json";
import { upsertLedgerRecord } from "@/lib/admin/admin-store";
import { env } from "@/lib/env";

type DubheTx = {
  ledger_system?: {
    credit_balance_with_receipt?: (args: {
      tx: Transaction;
      params: unknown[];
      isRaw: boolean;
    }) => void;
  };
};

function getEnv() {
  const rpcUrl = env.SUI_RPC_URL;
  const adminKey = env.SUI_ADMIN_PRIVATE_KEY;
  const packageId = env.SUI_PACKAGE_ID;
  const dappHubId = env.SUI_DAPP_HUB_ID;
  const dappHubInitialVersion = env.SUI_DAPP_HUB_INITIAL_SHARED_VERSION;
  if (!rpcUrl || !adminKey || !packageId || !dappHubId || !dappHubInitialVersion) {
    const missing = [
      !rpcUrl && "SUI_RPC_URL",
      !adminKey && "SUI_ADMIN_PRIVATE_KEY",
      !packageId && "SUI_PACKAGE_ID",
      !dappHubId && "SUI_DAPP_HUB_ID",
      !dappHubInitialVersion && "SUI_DAPP_HUB_INITIAL_SHARED_VERSION",
    ].filter(Boolean);
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }
  return {
    rpcUrl,
    network: env.SUI_NETWORK as NetworkType,
    adminKey,
    packageId,
    dappHubId,
    dappHubInitialVersion,
  };
}

type LedgerCreditParams = {
  userAddress: string;
  amount: string | number;
  receiptId: string;
  orderId?: string;
  note?: string;
  amountCny?: number;
  currency?: string;
  source?: string;
};

export async function creditLedgerWithAdmin(params: LedgerCreditParams) {
  const { rpcUrl, adminKey, packageId, dappHubId, dappHubInitialVersion, network } = getEnv();

  const amountStr = String(params.amount).trim();
  if (!/^[0-9]+$/.test(amountStr) || amountStr === "0") {
    throw new Error("amount must be positive integer");
  }

  const metadata = contractMetadata as SuiMoveNormalizedModules;
  const hasMetadata = Object.keys(metadata as Record<string, unknown>).length > 0;
  const dubhe = new Dubhe({
    networkType: network,
    fullnodeUrls: [rpcUrl],
    packageId,
    metadata,
    secretKey: adminKey,
  });

  const receiptBytes = Array.from(new TextEncoder().encode(params.receiptId));
  const buildTx = () => {
    const tx = new Transaction();
    const args = [
      tx.object(
        Inputs.SharedObjectRef({
          objectId: dappHubId,
          initialSharedVersion: dappHubInitialVersion.trim(),
          mutable: true,
        })
      ),
      tx.pure.address(params.userAddress),
      tx.pure.u64(amountStr),
      tx.pure.vector("u8", receiptBytes),
      tx.object("0x6"),
    ];

    const entry = (dubhe.tx as DubheTx).ledger_system?.credit_balance_with_receipt;
    if (hasMetadata && entry) {
      entry({ tx, params: args, isRaw: true });
    } else {
      tx.moveCall({
        target: `${packageId}::ledger_system::credit_balance_with_receipt`,
        arguments: args,
      });
    }
    return tx;
  };

  const retryable = (message: string) =>
    message.includes("already locked") ||
    message.includes("wrong epoch") ||
    message.includes("temporarily unavailable");

  let result;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const tx = buildTx();
      result = await dubhe.signAndSendTxn({ tx });
      lastError = null;
      break;
    } catch (e) {
      lastError = e as Error;
      if (attempt < 2 && retryable(lastError.message || "")) {
        await new Promise((resolve) => setTimeout(resolve, 600 + attempt * 600));
        continue;
      }
      throw lastError;
    }
  }
  if (!result) {
    throw lastError || new Error("credit failed");
  }

  const recordId = params.orderId?.trim() || params.receiptId;
  try {
    await upsertLedgerRecord({
      id: recordId,
      userAddress: params.userAddress,
      diamondAmount: Number(amountStr),
      amount: typeof params.amountCny === "number" ? params.amountCny : undefined,
      currency: params.currency,
      channel: params.source === "stripe" ? undefined : "manual",
      status: "credited",
      orderId: params.orderId?.trim() || undefined,
      receiptId: params.receiptId,
      source: params.source || "manual",
      note: params.note,
    });
  } catch {
    // ignore ledger record failures to avoid blocking credit success
  }

  return {
    digest: result.digest,
    effects: result.effects,
    events: result.events,
    recordId,
  };
}
