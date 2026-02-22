import { NextResponse } from "next/server";

const VITALS_KEY = "vitals:recent";
const MAX_ENTRIES = 500;
const TTL_MS = 86400_000; // 24h

type VitalEntry = {
  name: string;
  value: number;
  rating: string;
  page: string;
  timestamp: number;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, value, rating, page } = body;

    const vital: VitalEntry = {
      name,
      value: Math.round(value * 100) / 100,
      rating,
      page,
      timestamp: Date.now(),
    };

    console.log(JSON.stringify({ type: "web_vital", ...vital }));

    if (rating === "poor") {
      console.warn(`[WEB_VITAL_POOR] ${name}=${value} on ${page}`);
    }

    // Store in Redis (best-effort)
    try {
      const { getCacheAsync, setCache } = await import("@/lib/server-cache");
      const entry = await getCacheAsync<string>(VITALS_KEY);
      const entries: VitalEntry[] = entry ? JSON.parse(entry.value) : [];
      entries.push(vital);
      setCache(VITALS_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)), TTL_MS);
    } catch {
      /* Redis unavailable */
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    const { requireAdmin } = await import("@/lib/admin/admin-auth");
    const auth = await requireAdmin(req, { role: "viewer" });
    if (!auth.ok) return auth.response;

    const { getCacheAsync } = await import("@/lib/server-cache");
    const entry = await getCacheAsync<string>(VITALS_KEY);
    const entries: VitalEntry[] = entry ? JSON.parse(entry.value) : [];

    // Aggregate by metric name
    const metrics: Record<
      string,
      { values: number[]; poor: number; good: number; needs_improvement: number }
    > = {};
    for (const e of entries) {
      if (!metrics[e.name])
        metrics[e.name] = { values: [], poor: 0, good: 0, needs_improvement: 0 };
      metrics[e.name].values.push(e.value);
      if (e.rating === "poor") metrics[e.name].poor++;
      else if (e.rating === "good") metrics[e.name].good++;
      else metrics[e.name].needs_improvement++;
    }

    const summary = Object.entries(metrics).map(([name, data]) => {
      const sorted = [...data.values].sort((a, b) => a - b);
      return {
        name,
        count: sorted.length,
        p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
        p75: sorted[Math.floor(sorted.length * 0.75)] || 0,
        p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
        good: data.good,
        needs_improvement: data.needs_improvement,
        poor: data.poor,
      };
    });

    return NextResponse.json({ summary, totalEntries: entries.length });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
