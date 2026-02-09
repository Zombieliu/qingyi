import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { findChainOrder, upsertChainOrder } from "@/lib/chain-sync";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { requireUserAuth } from "@/lib/user-auth";

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function POST(req: Request, { params }: RouteContext) {
  const { orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  const admin = await requireAdmin(req, { role: "viewer", requireOrigin: false, allowToken: true });
  const chain = await findChainOrder(orderId);
  if (!chain) {
    return NextResponse.json({ error: "chain order not found" }, { status: 404 });
  }
  if (!admin.ok) {
    let rawBody = "";
    let body: { userAddress?: string } = {};
    try {
      rawBody = await req.text();
      body = rawBody ? (JSON.parse(rawBody) as { userAddress?: string }) : {};
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const userAddressRaw = typeof body.userAddress === "string" ? body.userAddress : "";
    if (!userAddressRaw) {
      return NextResponse.json({ error: "userAddress required" }, { status: 401 });
    }
    const normalized = normalizeSuiAddress(userAddressRaw);
    if (!isValidSuiAddress(normalized)) {
      return NextResponse.json({ error: "invalid userAddress" }, { status: 400 });
    }
    if (chain.user !== normalized) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const auth = await requireUserAuth(req, {
      intent: `orders:chain-sync:${orderId}`,
      address: normalized,
      body: rawBody,
    });
    if (!auth.ok) return auth.response;
  }

  const synced = await upsertChainOrder(chain);

  return NextResponse.json(synced);
}
