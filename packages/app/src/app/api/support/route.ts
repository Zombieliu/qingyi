import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { addSupportTicket } from "@/lib/admin/admin-store";
import type { AdminSupportTicket, SupportStatus } from "@/lib/admin/admin-types";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/shared/api-utils";
import { parseBody } from "@/lib/shared/api-validation";

const supportSchema = z.object({
  message: z.string().trim().min(1, "message required"),
  name: z.string().optional(),
  userName: z.string().optional(),
  userAddress: z.string().optional(),
  contact: z.string().optional(),
  topic: z.string().optional(),
});

export async function POST(req: Request) {
  if (!(await rateLimit(`support:${getClientIp(req)}`, 5, 60000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = await parseBody(req, supportSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const ticket: AdminSupportTicket = {
    id: `SUP-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    userName: body.name || body.userName,
    userAddress: body.userAddress,
    contact: body.contact,
    topic: body.topic || "其他",
    message: body.message,
    status: "待处理" as SupportStatus,
    createdAt: Date.now(),
  };

  await addSupportTicket(ticket);
  return NextResponse.json({ id: ticket.id, status: ticket.status });
}
