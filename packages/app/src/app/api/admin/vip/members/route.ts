import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/admin-auth";
import { addMember, queryMembers } from "@/lib/admin-store";
import { recordAudit } from "@/lib/admin-audit";
import type { AdminMember, MemberStatus } from "@/lib/admin-types";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const status = searchParams.get("status") || "";
  const q = searchParams.get("q") || "";

  const result = await queryMembers({ page, pageSize, status, q });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  let body: Partial<AdminMember> = {};
  try {
    body = (await req.json()) as Partial<AdminMember>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.userAddress && !body.userName) {
    return NextResponse.json({ error: "userAddress or userName required" }, { status: 400 });
  }

  const member: AdminMember = {
    id: body.id || `MBR-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    userAddress: body.userAddress,
    userName: body.userName,
    tierId: body.tierId,
    tierName: body.tierName,
    points: body.points,
    status: (body.status as MemberStatus) || "待开通",
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
