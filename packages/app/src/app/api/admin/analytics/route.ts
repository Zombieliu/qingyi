import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;

function clampDays(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_DAYS;
  return Math.max(1, Math.min(MAX_DAYS, Math.floor(value)));
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const days = clampDays(Number(searchParams.get("days") || DEFAULT_DAYS));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await prisma.growthEvent.findMany({
    where: { createdAt: { gte: since } },
    select: { event: true, clientId: true, sessionId: true, userAddress: true, path: true },
  });

  const uniqueByEvent = new Map<string, Set<string>>();
  const countsByEvent = new Map<string, number>();
  const pathCounts = new Map<string, number>();

  for (const row of rows) {
    const identity = row.clientId || row.sessionId || row.userAddress || row.path || "unknown";
    if (!uniqueByEvent.has(row.event)) uniqueByEvent.set(row.event, new Set());
    uniqueByEvent.get(row.event)!.add(identity);
    countsByEvent.set(row.event, (countsByEvent.get(row.event) || 0) + 1);
    if (row.path) {
      pathCounts.set(row.path, (pathCounts.get(row.path) || 0) + 1);
    }
  }

  const funnelSteps = ["page_view", "order_intent", "order_create_success"];
  const funnel = funnelSteps.map((step, index) => {
    const unique = uniqueByEvent.get(step)?.size || 0;
    const prevUnique = index === 0 ? unique : uniqueByEvent.get(funnelSteps[index - 1])?.size || 0;
    return {
      step,
      unique,
      conversionFromPrev: prevUnique > 0 ? Number((unique / prevUnique).toFixed(3)) : 0,
    };
  });

  const events = Array.from(countsByEvent.entries())
    .map(([event, count]) => ({
      event,
      count,
      unique: uniqueByEvent.get(event)?.size || 0,
    }))
    .sort((a, b) => b.count - a.count);

  const topPaths = Array.from(pathCounts.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return NextResponse.json({
    rangeDays: days,
    totalEvents: rows.length,
    events,
    funnel,
    topPaths,
  });
}
