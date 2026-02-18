import "server-only";

import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromBase64, isValidSuiAddress, normalizeSuiAddress, toBase64 } from "@mysten/sui/utils";
import { PACKAGE_ID } from "contracts/deployment";

const DEFAULT_SPONSOR_GAS_BUDGET = 50_000_000;

const ALLOWED_TARGETS = new Set([
  `${normalizeSuiAddress(PACKAGE_ID)}::order_system::create_order`,
  `${normalizeSuiAddress(PACKAGE_ID)}::order_system::pay_service_fee`,
  `${normalizeSuiAddress(PACKAGE_ID)}::order_system::claim_order`,
  `${normalizeSuiAddress(PACKAGE_ID)}::order_system::lock_deposit`,
  `${normalizeSuiAddress(PACKAGE_ID)}::order_system::mark_completed`,
  `${normalizeSuiAddress(PACKAGE_ID)}::order_system::raise_dispute`,
  `${normalizeSuiAddress(PACKAGE_ID)}::order_system::finalize_no_dispute`,
  `${normalizeSuiAddress(PACKAGE_ID)}::order_system::cancel_order`,
]);

function getRpcUrl(): string {
  const explicit = process.env.SUI_RPC_URL || process.env.NEXT_PUBLIC_SUI_RPC_URL;
  if (explicit) return explicit;
  const network = process.env.SUI_NETWORK || process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet";
  return getFullnodeUrl(network as "testnet" | "mainnet" | "devnet" | "localnet");
}

function getSponsorSigner() {
  const key = process.env.SUI_SPONSOR_PRIVATE_KEY || process.env.SUI_ADMIN_PRIVATE_KEY;
  if (!key) {
    throw new Error("Missing SUI_SPONSOR_PRIVATE_KEY");
  }
  return Ed25519Keypair.fromSecretKey(key);
}

function resolveGasBudget(): number {
  const raw = process.env.SUI_SPONSOR_GAS_BUDGET;
  if (!raw) return DEFAULT_SPONSOR_GAS_BUDGET;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Invalid SUI_SPONSOR_GAS_BUDGET");
  }
  return parsed;
}

function ensureAllowedSponsoredTransaction(tx: Transaction) {
  const data = tx.getData();
  if (!Array.isArray(data.commands) || data.commands.length === 0) {
    throw new Error("Transaction has no commands");
  }
  for (const command of data.commands) {
    if (command.$kind !== "MoveCall") {
      throw new Error("Only MoveCall commands are allowed");
    }
    const move = command.MoveCall;
    const target = `${move.package}::${move.module}::${move.function}`;
    if (!ALLOWED_TARGETS.has(target)) {
      throw new Error(`MoveCall target not allowed: ${target}`);
    }
  }
  if (!data.sender || !isValidSuiAddress(normalizeSuiAddress(data.sender))) {
    throw new Error("Invalid sender");
  }
  return data;
}

export async function buildSponsoredTransactionFromKind(params: { sender: string; kindBytes: string }) {
  const sender = normalizeSuiAddress(params.sender);
  if (!isValidSuiAddress(sender)) {
    throw new Error("Invalid sender address");
  }

  const tx = Transaction.fromKind(params.kindBytes);
  tx.setSender(sender);

  ensureAllowedSponsoredTransaction(tx);

  const sponsorSigner = getSponsorSigner();
  const sponsor = sponsorSigner.toSuiAddress();
  const client = new SuiClient({ url: getRpcUrl() });

  tx.setGasOwner(sponsor);
  const budget = resolveGasBudget();
  if (budget) {
    tx.setGasBudget(budget);
  }

  const bytes = await tx.build({ client });

  return {
    bytes: toBase64(bytes),
    sponsor,
    sender,
    gasBudget: budget,
  };
}

export async function executeSponsoredTransaction(params: { txBytes: string; userSignature: string }) {
  const bytes = fromBase64(params.txBytes);
  const tx = Transaction.from(bytes);
  const data = ensureAllowedSponsoredTransaction(tx);

  const sponsorSigner = getSponsorSigner();
  const sponsor = sponsorSigner.toSuiAddress();
  const gasOwner = data.gasData?.owner ? normalizeSuiAddress(data.gasData.owner) : "";
  if (gasOwner && gasOwner !== normalizeSuiAddress(sponsor)) {
    throw new Error("Gas owner mismatch");
  }

  const maxBudget = resolveGasBudget();
  if (data.gasData?.budget) {
    const budget = Number(data.gasData.budget);
    if (!Number.isFinite(budget) || budget > maxBudget) {
      throw new Error("Gas budget exceeds sponsor limit");
    }
  }

  const client = new SuiClient({ url: getRpcUrl() });
  const sponsorSignature = await sponsorSigner.signTransaction(bytes);
  const result = await client.executeTransactionBlock({
    transactionBlock: bytes,
    signature: [params.userSignature, sponsorSignature.signature],
    options: { showEffects: true },
  });
  const status = result.effects?.status?.status;
  if (status && status !== "success") {
    throw new Error(result.effects?.status?.error || "链上交易失败");
  }

  return { digest: result.digest };
}
