import { NextResponse } from "next/server";
import crypto from "crypto";
import { addGuardianApplication } from "@/lib/admin/admin-store";
import type { AdminGuardianApplication, GuardianStatus } from "@/lib/admin/admin-types";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { rateLimit } from "@/lib/rate-limit";

const GUARDIAN_RATE_LIMIT_WINDOW_MS = Number(process.env.GUARDIAN_RATE_LIMIT_WINDOW_MS || "60000");
const GUARDIAN_RATE_LIMIT_MAX = Number(process.env.GUARDIAN_RATE_LIMIT_MAX || "10");

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

async function enforceRateLimit(req: Request) {
  const key = `guardians:apply:${getClientIp(req)}`;
  return rateLimit(key, GUARDIAN_RATE_LIMIT_MAX, GUARDIAN_RATE_LIMIT_WINDOW_MS);
}

export async function POST(req: Request) {
  if (!(await enforceRateLimit(req))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  let body: {
    name?: string;
    contact?: string;
    games?: string;
    experience?: string;
    availability?: string;
    note?: string;
    userAddress?: string;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name?.trim() || !body.contact?.trim()) {
    return NextResponse.json({ error: "name and contact required" }, { status: 400 });
  }

  const address = normalizeSuiAddress(body.userAddress || "");
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }
  const auth = await requireUserAuth(req, { intent: "guardians:apply", address });
  if (!auth.ok) return auth.response;

  const application: AdminGuardianApplication = {
    id: `GUA-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    user: body.name.trim(),
    userAddress: address,
    contact: body.contact.trim(),
    games: body.games?.trim(),
    experience: body.experience?.trim(),
    availability: body.availability?.trim(),
    note: body.note?.trim(),
    status: "待审核" as GuardianStatus,
    createdAt: Date.now(),
  };

  await addGuardianApplication(application);
  return NextResponse.json({ id: application.id, status: application.status });
}
