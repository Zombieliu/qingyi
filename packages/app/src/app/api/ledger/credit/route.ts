import { NextResponse } from "next/server";
import { Dubhe, Transaction, type NetworkType, type SuiMoveNormalizedModules } from "@0xobelisk/sui-client";
import { Inputs } from "@mysten/sui/transactions";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import contractMetadata from "contracts/metadata.json";

const REQUIRED_ENVS = [
  "SUI_RPC_URL",
  "SUI_ADMIN_PRIVATE_KEY",
  "SUI_PACKAGE_ID",
  "SUI_DAPP_HUB_ID",
  "SUI_DAPP_HUB_INITIAL_SHARED_VERSION",
  "LEDGER_ADMIN_TOKEN",
] as const;

function getEnv() {
  const missing = REQUIRED_ENVS.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }
  return {
    rpcUrl: process.env.SUI_RPC_URL as string,
    network: (process.env.SUI_NETWORK as NetworkType) || "localnet",
    adminKey: process.env.SUI_ADMIN_PRIVATE_KEY as string,
    packageId: process.env.SUI_PACKAGE_ID as string,
    dappHubId: process.env.SUI_DAPP_HUB_ID as string,
    dappHubInitialVersion: process.env.SUI_DAPP_HUB_INITIAL_SHARED_VERSION as string,
    adminToken: process.env.LEDGER_ADMIN_TOKEN as string,
  };
}

function requireAuth(req: Request, token: string) {
  const header = req.headers.get("authorization") || "";
  const alt = req.headers.get("x-admin-token") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  return bearer === token || alt === token;
}

export async function POST(req: Request) {
  try {
    const { adminToken, rpcUrl, adminKey, packageId, dappHubId, dappHubInitialVersion, network } = getEnv();

    if (!requireAuth(req, adminToken)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      user?: string;
      amount?: string | number;
      receiptId?: string;
      note?: string;
    };
    const user = body.user ? normalizeSuiAddress(body.user) : "";
    if (!user || !isValidSuiAddress(user)) {
      return NextResponse.json({ error: "invalid user address" }, { status: 400 });
    }

    if (body.amount === undefined || body.amount === null) {
      return NextResponse.json({ error: "amount required" }, { status: 400 });
    }
    const amountStr = String(body.amount).trim();
    if (!/^[0-9]+$/.test(amountStr) || amountStr === "0") {
      return NextResponse.json({ error: "amount must be positive integer" }, { status: 400 });
    }

    const receiptId = typeof body.receiptId === "string" ? body.receiptId.trim() : "";
    if (!receiptId) {
      return NextResponse.json({ error: "receiptId required" }, { status: 400 });
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

    const receiptBytes = Array.from(new TextEncoder().encode(receiptId));
    const tx = new Transaction();
    const args = [
      tx.object(
        Inputs.SharedObjectRef({
          objectId: dappHubId,
          initialSharedVersion: dappHubInitialVersion.trim(),
          mutable: true,
        })
      ),
      tx.pure.address(user),
      tx.pure.u64(amountStr),
      tx.pure.vector("u8", receiptBytes),
      tx.object("0x6"),
    ];

    const entry = (dubhe.tx as Record<string, any>)?.ledger_system?.credit_balance_with_receipt;
    if (hasMetadata && entry) {
      await entry({ tx, params: args, isRaw: true });
    } else {
      tx.moveCall({
        target: `${packageId}::ledger_system::credit_balance_with_receipt`,
        arguments: args,
      });
    }

    const result = await dubhe.signAndSendTxn({ tx });

    return NextResponse.json({
      ok: true,
      digest: result.digest,
      effects: result.effects,
      events: result.events,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "credit failed" }, { status: 500 });
  }
}
