import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { findChainOrder, upsertChainOrder } from "@/lib/chain-sync";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";

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
    let body: { userAddress?: string } = {};
    try {
      body = (await req.json()) as { userAddress?: string };
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
  }

  const synced = await upsertChainOrder(chain);

  return NextResponse.json(synced);
}
