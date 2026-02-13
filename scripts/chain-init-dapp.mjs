#!/usr/bin/env node
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction, Inputs } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const rpcUrl = process.env.SUI_RPC_URL || process.env.NEXT_PUBLIC_SUI_RPC_URL || getFullnodeUrl("testnet");
const packageId = process.env.SUI_PACKAGE_ID || process.env.NEXT_PUBLIC_SUI_PACKAGE_ID || "";
const dappHubId = process.env.SUI_DAPP_HUB_ID || process.env.NEXT_PUBLIC_SUI_DAPP_HUB_ID || "";
const dappHubVersion =
  process.env.SUI_DAPP_HUB_INITIAL_SHARED_VERSION || process.env.NEXT_PUBLIC_SUI_DAPP_HUB_INITIAL_SHARED_VERSION || "";
const adminKey = process.env.E2E_SUI_ADMIN_PRIVATE_KEY || process.env.SUI_ADMIN_PRIVATE_KEY || "";

if (!packageId || !dappHubId || !dappHubVersion) {
  console.error("Missing SUI_PACKAGE_ID / SUI_DAPP_HUB_ID / SUI_DAPP_HUB_INITIAL_SHARED_VERSION");
  process.exit(1);
}
if (!adminKey) {
  console.error("Missing SUI_ADMIN_PRIVATE_KEY (or E2E_SUI_ADMIN_PRIVATE_KEY)");
  process.exit(1);
}

const signer = Ed25519Keypair.fromSecretKey(adminKey);
const client = new SuiClient({ url: rpcUrl });

const tx = new Transaction();
const hub = Inputs.SharedObjectRef({
  objectId: dappHubId,
  initialSharedVersion: dappHubVersion,
  mutable: true,
});

tx.moveCall({
  target: `${packageId}::genesis::run`,
  arguments: [tx.object(hub), tx.object("0x6")],
});

try {
  const result = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true },
  });
  const status = result.effects?.status?.status;
  if (status && status !== "success") {
    throw new Error(result.effects?.status?.error || "链上交易失败");
  }
  console.log("[chain-init-dapp] ok: genesis::run");
  console.log(`[chain-init-dapp] digest: ${result.digest}`);
} catch (error) {
  console.error("[chain-init-dapp] failed:", (error && error.message) || error);
  process.exit(1);
}
