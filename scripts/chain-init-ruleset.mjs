#!/usr/bin/env node
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction, Inputs } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const argv = process.argv.slice(2);

function readArg(name, fallback) {
  const long = `--${name}`;
  const idx = argv.findIndex((arg) => arg === long || arg.startsWith(`${long}=`));
  if (idx === -1) return fallback;
  const arg = argv[idx];
  if (arg.includes("=")) return arg.split("=").slice(1).join("=") || fallback;
  const next = argv[idx + 1];
  return next && !next.startsWith("--") ? next : fallback;
}

function requireNumber(value, label) {
  if (!/^[0-9]+$/.test(String(value))) {
    throw new Error(`${label} must be a number`);
  }
  return String(value);
}

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

const ruleSetId = requireNumber(readArg("id", process.env.NEXT_PUBLIC_QY_RULESET_ID || "1"), "rule_set_id");
const ruleHash = readArg("hash", process.env.QY_RULESET_HASH || "v1");
const disputeWindowMs = requireNumber(readArg("window", process.env.QY_DISPUTE_WINDOW_MS || "86400000"), "window");
const platformFeeBps = requireNumber(readArg("fee", process.env.QY_PLATFORM_FEE_BPS || "1500"), "fee_bps");

const signer = Ed25519Keypair.fromSecretKey(adminKey);
const client = new SuiClient({ url: rpcUrl });

const tx = new Transaction();
const hub = Inputs.SharedObjectRef({
  objectId: dappHubId,
  initialSharedVersion: dappHubVersion,
  mutable: true,
});
const hashBytes = Array.from(new TextEncoder().encode(ruleHash));

tx.moveCall({
  target: `${packageId}::ruleset_system::create_ruleset`,
  arguments: [
    tx.object(hub),
    tx.pure.u64(ruleSetId),
    tx.pure.vector("u8", hashBytes),
    tx.pure.u64(disputeWindowMs),
    tx.pure.u64(platformFeeBps),
  ],
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
  console.log(
    `[chain-init-ruleset] ok: rule_set_id=${ruleSetId} hash=${ruleHash} window=${disputeWindowMs} fee_bps=${platformFeeBps}`
  );
  console.log(`[chain-init-ruleset] digest: ${result.digest}`);
} catch (error) {
  console.error("[chain-init-ruleset] failed:", (error && error.message) || error);
  process.exit(1);
}
