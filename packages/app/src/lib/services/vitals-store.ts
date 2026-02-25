import "server-only";
import { prisma } from "../db";

export type VitalEntry = {
  name: string;
  value: number;
  rating: string;
  page: string;
  timestamp?: number;
};

/** Batch-insert vitals into the database. */
export async function persistVitals(entries: VitalEntry[]) {
  if (entries.length === 0) return;
  await prisma.webVital.createMany({
    data: entries.map((e) => ({
      name: e.name,
      value: e.value,
      rating: e.rating,
      page: e.page,
      createdAt: e.timestamp ? new Date(e.timestamp) : new Date(),
    })),
  });
}

/** Query daily p50/p75/p95 trend for a given metric over the last N days. */
export async function getVitalsTrend(name: string, days: number) {
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await prisma.webVital.findMany({
    where: { name, createdAt: { gte: since } },
    select: { value: true, rating: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Group by date string (YYYY-MM-DD)
  const buckets = new Map<string, number[]>();
  for (const r of rows) {
    const day = r.createdAt.toISOString().slice(0, 10);
    const arr = buckets.get(day) ?? [];
    arr.push(r.value);
    buckets.set(day, arr);
  }

  return Array.from(buckets.entries()).map(([day, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      day,
      count: sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
      p75: sorted[Math.floor(sorted.length * 0.75)] ?? 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    };
  });
}

/** Aggregate vitals summary for a specific page. */
export async function getVitalsPageSummary(page: string) {
  const rows = await prisma.webVital.findMany({
    where: { page },
    select: { name: true, value: true, rating: true },
  });

  const metrics: Record<
    string,
    { values: number[]; good: number; needs_improvement: number; poor: number }
  > = {};

  for (const r of rows) {
    if (!metrics[r.name]) metrics[r.name] = { values: [], good: 0, needs_improvement: 0, poor: 0 };
    metrics[r.name].values.push(r.value);
    if (r.rating === "good") metrics[r.name].good++;
    else if (r.rating === "poor") metrics[r.name].poor++;
    else metrics[r.name].needs_improvement++;
  }

  return Object.entries(metrics).map(([name, data]) => {
    const sorted = [...data.values].sort((a, b) => a - b);
    return {
      name,
      count: sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
      p75: sorted[Math.floor(sorted.length * 0.75)] ?? 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      good: data.good,
      needs_improvement: data.needs_improvement,
      poor: data.poor,
    };
  });
}
