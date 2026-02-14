import { NextResponse } from "next/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { getMantouWallet } from "@/lib/admin-store";

const MANTOU_BALANCE_CACHE_TTL_MS = 10_000;
const mantouCache = new Map<string, { value: { balance: number; frozen: number }; updatedAt: number; inflight?: Promise<{ balance: number; frozen: number }> }>();

export async function GET(req: Request) {
  const referer = req.headers.get("referer") || "";
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.pathname.startsWith("/admin")) {
        return NextResponse.json({ ok: true, balance: 0, frozen: 0, skipped: true });
      }
    } catch {
      // ignore invalid referer
    }
  }
  const { searchParams } = new URL(req.url);
  const address = normalizeSuiAddress(searchParams.get("address") || "");
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  const now = Date.now();
  const cached = mantouCache.get(address);
  if (cached && now - cached.updatedAt < MANTOU_BALANCE_CACHE_TTL_MS) {
    return NextResponse.json(
      { ok: true, balance: cached.value.balance, frozen: cached.value.frozen, cached: true },
      { headers: { "Cache-Control": "public, max-age=2, s-maxage=10, stale-while-revalidate=30" } }
    );
  }
  if (cached?.inflight) {
    const value = await cached.inflight;
    return NextResponse.json(
      { ok: true, balance: value.balance, frozen: value.frozen, cached: true },
      { headers: { "Cache-Control": "public, max-age=2, s-maxage=10, stale-while-revalidate=30" } }
    );
  }
  const task = (async () => {
    const wallet = await getMantouWallet(address);
    return { balance: wallet.balance, frozen: wallet.frozen };
  })();
  mantouCache.set(address, {
    value: cached?.value ?? { balance: 0, frozen: 0 },
    updatedAt: cached?.updatedAt ?? 0,
    inflight: task,
  });
  try {
    const value = await task;
    mantouCache.set(address, { value, updatedAt: Date.now() });
    return NextResponse.json(
      { ok: true, balance: value.balance, frozen: value.frozen },
      { headers: { "Cache-Control": "public, max-age=2, s-maxage=10, stale-while-revalidate=30" } }
    );
  } catch (error) {
    mantouCache.delete(address);
    if (cached?.value) {
      return NextResponse.json(
        { ok: true, balance: cached.value.balance, frozen: cached.value.frozen, cached: true, fallback: true },
        { headers: { "Cache-Control": "public, max-age=2, s-maxage=10, stale-while-revalidate=30" } }
      );
    }
    throw error;
  }
}
