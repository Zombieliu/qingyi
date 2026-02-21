import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { addGuardianApplication } from "@/lib/admin/admin-store";
import type { AdminGuardianApplication, GuardianStatus } from "@/lib/admin/admin-types";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/shared/api-utils";
import { parseBody } from "@/lib/shared/api-validation";
import { suiAddress } from "@/lib/shared/zod-utils";
import { env } from "@/lib/env";

const guardianSchema = z.object({
  name: z.string().trim().min(1, "name required"),
  contact: z.string().trim().min(1, "contact required"),
  userAddress: suiAddress,
  games: z.string().trim().optional(),
  experience: z.string().trim().optional(),
  availability: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

async function enforceRateLimit(req: Request) {
  const key = `guardians:apply:${getClientIp(req)}`;
  return rateLimit(key, env.GUARDIAN_RATE_LIMIT_MAX, env.GUARDIAN_RATE_LIMIT_WINDOW_MS);
}

export async function POST(req: Request) {
  if (!(await enforceRateLimit(req))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = await parseBody(req, guardianSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const auth = await requireUserAuth(req, { intent: "guardians:apply", address: body.userAddress });
  if (!auth.ok) return auth.response;

  const application: AdminGuardianApplication = {
    id: `GUA-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    user: body.name,
    userAddress: body.userAddress,
    contact: body.contact,
    games: body.games,
    experience: body.experience,
    availability: body.availability,
    note: body.note,
    status: "待审核" as GuardianStatus,
    createdAt: Date.now(),
  };

  await addGuardianApplication(application);
  return NextResponse.json({ id: application.id, status: application.status });
}
