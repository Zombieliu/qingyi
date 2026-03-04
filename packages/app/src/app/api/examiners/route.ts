import { NextResponse } from "next/server";
import { randomInt } from "@/lib/shared/runtime-crypto";
import { z } from "zod";
import { addExaminerApplication } from "@/lib/admin/admin-store";
import type { AdminExaminerApplication, ExaminerStatus } from "@/lib/admin/admin-types";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/shared/api-utils";
import { parseBody } from "@/lib/shared/api-validation";
import { suiAddress } from "@/lib/shared/zod-utils";
import { env } from "@/lib/env";
import { apiRateLimited } from "@/lib/shared/api-response";
import { createNotification } from "@/lib/services/notification-service";

const examinerSchema = z.object({
  name: z.string().trim().min(1, "name required"),
  contact: z.string().trim().min(1, "contact required"),
  userAddress: suiAddress,
  games: z.string().trim().optional(),
  rank: z.string().trim().optional(),
  liveTime: z.string().trim().optional(),
  note: z.string().trim().optional(),
  attachments: z.array(z.string().max(700_000)).max(3).optional(),
});

async function enforceRateLimit(req: Request) {
  const key = `examiners:apply:${getClientIp(req)}`;
  return rateLimit(key, env.GUARDIAN_RATE_LIMIT_MAX, env.GUARDIAN_RATE_LIMIT_WINDOW_MS);
}

export async function POST(req: Request) {
  if (!(await enforceRateLimit(req))) {
    return apiRateLimited();
  }

  const parsed = await parseBody(req, examinerSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const auth = await requireUserAuth(req, { intent: "examiners:apply", address: body.userAddress });
  if (!auth.ok) return auth.response;

  const application: AdminExaminerApplication = {
    id: `EXA-${Date.now()}-${randomInt(1000, 9999)}`,
    user: body.name,
    userAddress: body.userAddress,
    contact: body.contact,
    games: body.games,
    rank: body.rank,
    liveTime: body.liveTime,
    note: body.note,
    status: "待审核" as ExaminerStatus,
    meta: body.attachments?.length ? { attachments: body.attachments } : undefined,
    createdAt: Date.now(),
  };

  await addExaminerApplication(application);

  await createNotification({
    userAddress: body.userAddress,
    type: "system",
    title: "考官申请已提交",
    body: "已收到你的考官申请，审核结果会通过通知中心同步给你。",
  }).catch(() => null);

  return NextResponse.json({ id: application.id, status: application.status });
}
