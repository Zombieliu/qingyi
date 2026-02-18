import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { listChainOrdersForAdmin } from "@/lib/admin/admin-store";
import { fetchChainOrdersAdmin } from "@/lib/chain/chain-admin";
import { getAutoCancelConfig } from "@/lib/chain/chain-auto-cancel";

type LocalOrder = Awaited<ReturnType<typeof listChainOrdersForAdmin>>[number];

function readLocalChainStatus(order: LocalOrder) {
  const meta = (order.meta as { chain?: { status?: number } } | undefined)?.chain;
  const status = order.chainStatus ?? meta?.status;
  return typeof status === "number" ? status : null;
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;
  const chainOrders = await fetchChainOrdersAdmin();
  const localOrders = await listChainOrdersForAdmin();
  const autoCancel = getAutoCancelConfig();

  const chainById = new Map(chainOrders.map((order) => [order.orderId, order]));
  const localById = new Map(localOrders.map((order) => [order.id, order]));
  const localStatusById = new Map(
    localOrders.map((order) => [order.id, readLocalChainStatus(order)])
  );

  const missingLocal = chainOrders.filter((order) => !localById.has(order.orderId));
  const missingChain = localOrders.filter((order) => /^[0-9]+$/.test(order.id) && !chainById.has(order.id));
  const chainOrdersWithLocal = chainOrders.map((order) => {
    const localStatus = localStatusById.get(order.orderId);
    const effectiveStatus =
      typeof localStatus === "number" ? Math.max(localStatus, order.status) : order.status;
    return {
      ...order,
      localStatus,
      effectiveStatus,
    };
  });

  return NextResponse.json({
    chainOrders: chainOrdersWithLocal,
    localCount: localOrders.length,
    chainCount: chainOrders.length,
    missingLocal,
    missingChain,
    autoCancel: {
      enabled: autoCancel.enabled,
      hours: autoCancel.hours,
      max: autoCancel.max,
    },
  });
}
