import { Dubhe, Transaction, type SuiMoveNormalizedModules } from "@0xobelisk/sui-client";
import { Inputs } from "@mysten/sui/transactions";
import contractMetadata from "contracts/metadata.json";
import {
  DAPP_HUB_ID,
  DAPP_HUB_INITIAL_SHARED_VERSION,
  NETWORK,
  PACKAGE_ID,
} from "contracts/deployment";

const metadata = contractMetadata as SuiMoveNormalizedModules;
const hasMetadata = Object.keys(metadata as Record<string, unknown>).length > 0;

type DubheTx = {
  ledger_system?: {
    credit_balance_with_receipt?: (args: {
      tx: Transaction;
      params: unknown[];
      isRaw: boolean;
    }) => Promise<void> | void;
  };
};

export function createDubheClient(params?: { secretKey?: string }) {
  return new Dubhe({
    networkType: NETWORK,
    packageId: PACKAGE_ID,
    metadata,
    secretKey: params?.secretKey,
  });
}

export function getDappHubSharedObject(tx: Transaction) {
  return tx.object(
    Inputs.SharedObjectRef({
      objectId: DAPP_HUB_ID,
      initialSharedVersion: DAPP_HUB_INITIAL_SHARED_VERSION,
      mutable: true,
    })
  );
}

export async function attachCreditWithReceiptTx({
  dubhe,
  tx,
  owner,
  amount,
  receiptId,
}: {
  dubhe: Dubhe;
  tx: Transaction;
  owner: string;
  amount: string | number;
  receiptId: string;
}) {
  const receiptBytes = Array.from(new TextEncoder().encode(receiptId));
  const args = [
    getDappHubSharedObject(tx),
    tx.pure.address(owner),
    tx.pure.u64(String(amount)),
    tx.pure.vector("u8", receiptBytes),
    tx.object("0x6"),
  ];

  const entry = (dubhe.tx as DubheTx).ledger_system?.credit_balance_with_receipt;
  if (hasMetadata && entry) {
    await entry({ tx, params: args, isRaw: true });
    return;
  }

  tx.moveCall({
    target: `${PACKAGE_ID}::ledger_system::credit_balance_with_receipt`,
    arguments: args,
  });
}
