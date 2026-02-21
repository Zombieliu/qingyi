import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { addMember, queryMembers, queryMembersCursor } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import { parseBody } from "@/lib/shared/api-validation";
import type { MemberStatus } from "@/lib/admin/admin-types";
import { decodeCursorParam, encodeCursorParam } from "@/lib/cursor-utils";

const postSchema = z
  .object({
    id: z.string().optional(),
    userAddress: z.string().optional(),
    userName: z.string().optional(),
    tierId: z.string().optional(),
    tierName: z.string().optional(),
    points: z.number().optional(),
    status: z.enum(["有效", "已过期", "待开通"]).default("待开通"),
    expiresAt: z.number().optional(),
    note: z.string().optional(),
  })
  .refine((d) => d.userAddress || d.userName, { message: "userAddress or userName required" });

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const status = searchParams.get("status") || "";
  const q = searchParams.get("q") || "";
  const cursorRaw = searchParams.get("cursor");
  const cursor = decodeCursorParam(cursorRaw);
  const useCursor = !searchParams.has("page") || cursorRaw !== null;
  if (useCursor) {
    const result = await queryMembersCursor({
      pageSize,
      status: status || undefined,
      q: q || undefined,
      cursor: cursor || undefined,
    });
    return NextResponse.json({
      items: result.items,
      nextCursor: encodeCursorParam(result.nextCursor),
    });
  }

  const result = await queryMembers({ page, pageSize, status, q });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, postSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const member = {
    id: body.id || `MBR-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    userAddress: body.userAddress,
    userName: body.userName,
    tierId: body.tierId,
    tierName: body.tierName,
    points: body.points,
    status: body.status as MemberStatus,
    expiresAt: body.expiresAt,
    note: body.note,
    createdAt: Date.now(),
  };

  await addMember(member);
  await recordAudit(req, auth, "vip.member.create", "vip-member", member.id, {
    status: member.status,
  });

  return NextResponse.json(member, { status: 201 });
}
