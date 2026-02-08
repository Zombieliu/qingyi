import { NextResponse } from "next/server";
import { SuiClient } from "@mysten/sui/client";
import { bcs } from "@mysten/sui/bcs";
import { Inputs, Transaction } from "@mysten/sui/transactions";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";

const REQUIRED_ENVS = ["SUI_RPC_URL", "SUI_PACKAGE_ID", "SUI_DAPP_HUB_ID", "SUI_DAPP_HUB_INITIAL_SHARED_VERSION"] as const;

function getEnv() {
  const missing = REQUIRED_ENVS.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }
  return {
    rpcUrl: process.env.SUI_RPC_URL as string,
    packageId: process.env.SUI_PACKAGE_ID as string,
    dappHubId: process.env.SUI_DAPP_HUB_ID as string,
    dappHubInitialVersion: process.env.SUI_DAPP_HUB_INITIAL_SHARED_VERSION as string,
  };
}

function decodeU64(value: unknown): string {
  if (Array.isArray(value)) {
    return bcs.u64().parse(Uint8Array.from(value as number[]));
  }
  if (typeof value === "string") {
    return bcs.u64().parse(Uint8Array.from(Buffer.from(value, "base64")));
  }
  return "0";
}

export async function GET(req: Request) {
  const referer = req.headers.get("referer") || "";
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.pathname.startsWith("/admin")) {
        return NextResponse.json({ ok: true, balance: "0", skipped: true });
      }
    } catch {
      // ignore invalid referer
    }
  }
  try {
    const { searchParams } = new URL(req.url);
    const address = normalizeSuiAddress(searchParams.get("address") || "");
    if (!address || !isValidSuiAddress(address)) {
      return NextResponse.json({ error: "invalid address" }, { status: 400 });
    }

    const { rpcUrl, packageId, dappHubId, dappHubInitialVersion } = getEnv();
    const client = new SuiClient({ url: rpcUrl });
    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::ledger_system::get_balance`,
      arguments: [
        tx.object(
          Inputs.SharedObjectRef({
            objectId: dappHubId,
            initialSharedVersion: dappHubInitialVersion.trim(),
            mutable: false,
          })
        ),
        tx.pure.address(address),
      ],
    });

    const result = await client.devInspectTransactionBlock({
      sender: address,
      transactionBlock: tx,
    });

    const returnValues = result.results?.[0]?.returnValues || [];
    const rawValue = returnValues[0]?.[0];
    const balance = decodeU64(rawValue);

    return NextResponse.json({ ok: true, balance });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "balance query failed" }, { status: 500 });
  }
}
