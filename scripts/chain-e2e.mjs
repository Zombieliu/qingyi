#!/usr/bin/env node
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction, Inputs } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { normalizeSuiAddress } from "@mysten/sui/utils";

const args = new Set(process.argv.slice(2));
const useDispute = !args.has("--no-dispute");
const syncAfter = args.has("--sync");

const rpcUrl = process.env.SUI_RPC_URL || process.env.NEXT_PUBLIC_SUI_RPC_URL || getFullnodeUrl("testnet");
const packageId = process.env.SUI_PACKAGE_ID || process.env.NEXT_PUBLIC_SUI_PACKAGE_ID || "";
const dappHubId = process.env.SUI_DAPP_HUB_ID || process.env.NEXT_PUBLIC_SUI_DAPP_HUB_ID || "";
const dappHubVersion = process.env.SUI_DAPP_HUB_INITIAL_SHARED_VERSION ||
  process.env.NEXT_PUBLIC_SUI_DAPP_HUB_INITIAL_SHARED_VERSION ||
  "";

if (!packageId || !dappHubId || !dappHubVersion) {
  console.error("Missing SUI_PACKAGE_ID / SUI_DAPP_HUB_ID / SUI_DAPP_HUB_INITIAL_SHARED_VERSION");
  process.exit(1);
}

const userKey = process.env.E2E_SUI_USER_PRIVATE_KEY || process.env.SUI_ADMIN_PRIVATE_KEY || "";
const companionKey = process.env.E2E_SUI_COMPANION_PRIVATE_KEY || process.env.SUI_ADMIN_PRIVATE_KEY || "";
const adminKey = process.env.E2E_SUI_ADMIN_PRIVATE_KEY || process.env.SUI_ADMIN_PRIVATE_KEY || "";

if (!userKey || !companionKey) {
  console.error("Missing E2E_SUI_USER_PRIVATE_KEY / E2E_SUI_COMPANION_PRIVATE_KEY (or SUI_ADMIN_PRIVATE_KEY)");
  process.exit(1);
}

const ruleSetId = process.env.NEXT_PUBLIC_QY_RULESET_ID || "1";
const serviceFee = Number(process.env.E2E_ORDER_SERVICE_FEE || "1");
const deposit = Number(process.env.E2E_ORDER_DEPOSIT || "1");

const client = new SuiClient({ url: rpcUrl });

function toChainAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) throw new Error("invalid amount");
  return String(Math.round(num * 100));
}

function getSigner(secret) {
  return Ed25519Keypair.fromSecretKey(secret);
}

const userSigner = getSigner(userKey);
const companionSigner = getSigner(companionKey);
const adminSigner = adminKey ? getSigner(adminKey) : null;

const userAddress = userSigner.getPublicKey().toSuiAddress();
const companionAddress = companionSigner.getPublicKey().toSuiAddress();

const orderId = String(Date.now() * 1000 + Math.floor(Math.random() * 1000));

function dappHubRef(tx) {
  return tx.object(
    Inputs.SharedObjectRef({
      objectId: dappHubId,
      initialSharedVersion: dappHubVersion,
      mutable: true,
    })
  );
}

async function signAndExecute(signer, tx, label) {
  const result = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true },
  });
  console.log(`[chain-e2e] ${label}:`, result.digest);
  return result.digest;
}

async function createAndPay() {
  const tx = new Transaction();
  const hub = dappHubRef(tx);
  tx.moveCall({
    target: `${packageId}::order_system::create_order`,
    arguments: [
      hub,
      tx.pure.u64(orderId),
      tx.pure.address(normalizeSuiAddress(companionAddress)),
      tx.pure.u64(ruleSetId),
      tx.pure.u64(toChainAmount(serviceFee)),
      tx.pure.u64(toChainAmount(deposit)),
      tx.object("0x6"),
    ],
  });
  tx.moveCall({
    target: `${packageId}::order_system::pay_service_fee`,
    arguments: [hub, tx.pure.u64(orderId)],
  });
  await signAndExecute(userSigner, tx, "create+pay");
}

async function lockDeposit() {
  const tx = new Transaction();
  const hub = dappHubRef(tx);
  tx.moveCall({
    target: `${packageId}::order_system::lock_deposit`,
    arguments: [hub, tx.pure.u64(orderId)],
  });
  await signAndExecute(companionSigner, tx, "lock_deposit");
}

async function markCompleted() {
  const tx = new Transaction();
  const hub = dappHubRef(tx);
  tx.moveCall({
    target: `${packageId}::order_system::mark_completed`,
    arguments: [hub, tx.pure.u64(orderId), tx.object("0x6")],
  });
  await signAndExecute(userSigner, tx, "mark_completed");
}

async function raiseDispute() {
  const tx = new Transaction();
  const hub = dappHubRef(tx);
  const evidence = new TextEncoder().encode("e2e-dispute");
  tx.moveCall({
    target: `${packageId}::order_system::raise_dispute`,
    arguments: [hub, tx.pure.u64(orderId), tx.pure.vector("u8", Array.from(evidence)), tx.object("0x6")],
  });
  await signAndExecute(userSigner, tx, "raise_dispute");
}

async function resolveDispute() {
  if (!adminSigner) throw new Error("Missing admin key for resolve_dispute");
  const tx = new Transaction();
  const hub = dappHubRef(tx);
  tx.moveCall({
    target: `${packageId}::order_system::resolve_dispute`,
    arguments: [hub, tx.pure.u64(orderId), tx.pure.u64(0), tx.pure.u64(0), tx.object("0x6")],
  });
  await signAndExecute(adminSigner, tx, "resolve_dispute");
}

async function finalizeNoDispute() {
  const tx = new Transaction();
  const hub = dappHubRef(tx);
  tx.moveCall({
    target: `${packageId}::order_system::finalize_no_dispute`,
    arguments: [hub, tx.pure.u64(orderId), tx.object("0x6")],
  });
  await signAndExecute(userSigner, tx, "finalize_no_dispute");
}

async function syncOrder() {
  const base = process.env.ORDER_API_BASE_URL || "http://127.0.0.1:3000";
  const res = await fetch(`${base}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId,
      user: userAddress,
      userAddress,
      companionAddress,
      item: `链上订单 #${orderId}`,
      amount: serviceFee + deposit,
      status: "链上已创建",
      note: "chain-e2e",
      chainStatus: 1,
      serviceFee,
      deposit,
      meta: { source: "chain-e2e" },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.warn("[chain-e2e] sync order failed", data);
  } else {
    console.log("[chain-e2e] order synced", data.orderId || orderId);
  }

  if (syncAfter) {
    const cronRes = await fetch(`${base}/api/cron/chain-sync`);
    const cronData = await cronRes.json().catch(() => ({}));
    console.log("[chain-e2e] chain sync", cronData);
  }
}

async function main() {
  console.log(`[chain-e2e] user=${userAddress} companion=${companionAddress} order=${orderId}`);
  await createAndPay();
  await lockDeposit();
  await markCompleted();
  if (useDispute) {
    await raiseDispute();
    await resolveDispute();
  } else {
    await finalizeNoDispute();
  }
  await syncOrder();
  console.log("[chain-e2e] done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
