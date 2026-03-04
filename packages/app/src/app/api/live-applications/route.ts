import { NextResponse } from "next/server";
import { randomInt } from "@/lib/shared/runtime-crypto";
import { z } from "zod";
import { addLiveApplication, getPlayerByAddress } from "@/lib/admin/admin-store";
import type { AdminLiveApplication, LiveStatus } from "@/lib/admin/admin-types";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/shared/api-utils";
import { parseBody } from "@/lib/shared/api-validation";
import { suiAddress } from "@/lib/shared/zod-utils";
import { env } from "@/lib/env";
import { apiForbidden, apiRateLimited } from "@/lib/shared/api-response";
import { createNotification } from "@/lib/services/notification-service";

const liveSchema = z.object({
  name: z.string().trim().min(1, "name required"),
  contact: z.string().trim().min(1, "contact required"),
  userAddress: suiAddress,
  platform: z.string().trim().optional(),
  liveUrl: z.string().trim().optional(),
  games: z.string().trim().optional(),
  liveTime: z.string().trim().optional(),
  note: z.string().trim().optional(),
  attachments: z.array(z.string().max(700_000)).max(3).optional(),
});

async function enforceRateLimit(req: Request) {
  const key = `live:apply:${getClientIp(req)}`;
  return rateLimit(key, env.GUARDIAN_RATE_LIMIT_MAX, env.GUARDIAN_RATE_LIMIT_WINDOW_MS);
}

export async function POST(req: Request) {
  if (!(await enforceRateLimit(req))) {
    return apiRateLimited();
  }

  const parsed = await parseBody(req, liveSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const auth = await requireUserAuth(req, { intent: "live:apply", address: body.userAddress });
  if (!auth.ok) return auth.response;

  const playerResult = await getPlayerByAddress(body.userAddress);
  if (!playerResult.player || playerResult.player.status === "停用") {
    return apiForbidden("guardian_required");
  }

  const application: AdminLiveApplication = {
    id: `LIV-${Date.now()}-${randomInt(1000, 9999)}`,
    user: body.name,
    userAddress: body.userAddress,
    contact: body.contact,
    platform: body.platform,
    liveUrl: body.liveUrl,
    games: body.games,
    liveTime: body.liveTime,
    note: body.note,
    status: "待审核" as LiveStatus,
    meta: body.attachments?.length ? { attachments: body.attachments } : undefined,
    createdAt: Date.now(),
  };

  await addLiveApplication(application);

  await createNotification({
    userAddress: body.userAddress,
    type: "system",
    title: "开播申请已提交",
    body: "已收到你的开播申请，审核结果会通过通知中心同步给你。",
  }).catch(() => null);

  return NextResponse.json({ id: application.id, status: application.status });
}
