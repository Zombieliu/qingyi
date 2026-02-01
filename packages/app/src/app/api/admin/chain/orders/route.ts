import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listOrders } from "@/lib/admin-store";
import { fetchChainOrdersAdmin } from "@/lib/chain-admin";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;
  const chainOrders = await fetchChainOrdersAdmin();
  const localOrders = await listOrders();

  const chainById = new Map(chainOrders.map((order) => [order.orderId, order]));
  const localById = new Map(localOrders.map((order) => [order.id, order]));

  const missingLocal = chainOrders.filter((order) => !localById.has(order.orderId));
  const missingChain = localOrders.filter((order) => /^[0-9]+$/.test(order.id) && !chainById.has(order.id));

  return NextResponse.json({
    chainOrders,
    localCount: localOrders.length,
    chainCount: chainOrders.length,
    missingLocal,
    missingChain,
  });
}
