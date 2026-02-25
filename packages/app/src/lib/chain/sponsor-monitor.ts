import "server-only";

import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { env } from "@/lib/env";
import { sendAlert } from "@/lib/services/alert-service";

/** 1 SUI = 10^9 MIST */
const MIST_PER_SUI = 1_000_000_000;

/** Default thresholds in SUI */
const DEFAULT_WARNING_THRESHOLD_SUI = 2;
const DEFAULT_CRITICAL_THRESHOLD_SUI = 1;

function getRpcUrl(): string {
  const explicit = env.SUI_RPC_URL || env.NEXT_PUBLIC_SUI_RPC_URL;
  if (explicit) return explicit;
  const network = env.SUI_NETWORK;
  return getFullnodeUrl(network as "testnet" | "mainnet" | "devnet" | "localnet");
}

function getSponsorAddress(): string {
  const key = env.SUI_SPONSOR_PRIVATE_KEY || env.SUI_ADMIN_PRIVATE_KEY;
  if (!key) {
    throw new Error("Missing SUI_SPONSOR_PRIVATE_KEY");
  }
  return Ed25519Keypair.fromSecretKey(key).toSuiAddress();
}

/** Fetch sponsor wallet SUI balance in MIST */
export async function getSponsorBalance(): Promise<bigint> {
  const client = new SuiClient({ url: getRpcUrl() });
  const address = getSponsorAddress();
  const balance = await client.getBalance({ owner: address });
  return BigInt(balance.totalBalance);
}

export type SponsorBalanceResult = {
  address: string;
  balanceMist: string;
  balanceSui: string;
  status: "ok" | "warning" | "critical";
  alerted: boolean;
};

/**
 * Check sponsor wallet balance and send alert if below threshold.
 *
 * @param warningThresholdSui - Warning threshold in SUI (default 2)
 * @param criticalThresholdSui - Critical threshold in SUI (default 1)
 */
export async function checkSponsorBalance(
  warningThresholdSui = DEFAULT_WARNING_THRESHOLD_SUI,
  criticalThresholdSui = DEFAULT_CRITICAL_THRESHOLD_SUI
): Promise<SponsorBalanceResult> {
  const address = getSponsorAddress();
  const balanceMist = await getSponsorBalance();
  const balanceSui = Number(balanceMist) / MIST_PER_SUI;

  const warningMist = BigInt(warningThresholdSui) * BigInt(MIST_PER_SUI);
  const criticalMist = BigInt(criticalThresholdSui) * BigInt(MIST_PER_SUI);

  let status: "ok" | "warning" | "critical" = "ok";
  let alerted = false;

  if (balanceMist < criticalMist) {
    status = "critical";
    await sendAlert({
      level: "critical",
      title: "Sponsor 钱包余额严重不足",
      message: `Sponsor 地址 ${address.slice(0, 10)}... 余额仅 ${balanceSui.toFixed(4)} SUI，低于阈值 ${criticalThresholdSui} SUI`,
      metric: "sponsor_balance",
      value: balanceSui,
      threshold: criticalThresholdSui,
    });
    alerted = true;
  } else if (balanceMist < warningMist) {
    status = "warning";
    await sendAlert({
      level: "warning",
      title: "Sponsor 钱包余额偏低",
      message: `Sponsor 地址 ${address.slice(0, 10)}... 余额 ${balanceSui.toFixed(4)} SUI，低于警告阈值 ${warningThresholdSui} SUI`,
      metric: "sponsor_balance",
      value: balanceSui,
      threshold: warningThresholdSui,
    });
    alerted = true;
  }

  return {
    address,
    balanceMist: balanceMist.toString(),
    balanceSui: balanceSui.toFixed(4),
    status,
    alerted,
  };
}
