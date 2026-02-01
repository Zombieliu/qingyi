import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/admin-auth";
import { addGuardianApplication, queryGuardianApplications } from "@/lib/admin-store";
import { recordAudit } from "@/lib/admin-audit";
import type { AdminGuardianApplication, GuardianStatus } from "@/lib/admin-types";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const status = searchParams.get("status") || "";
  const q = searchParams.get("q") || "";

  const result = await queryGuardianApplications({ page, pageSize, status, q });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  let body: Partial<AdminGuardianApplication> = {};
  try {
    body = (await req.json()) as Partial<AdminGuardianApplication>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.user && !body.contact) {
    return NextResponse.json({ error: "user or contact required" }, { status: 400 });
  }

  const application: AdminGuardianApplication = {
    id: body.id || `GUA-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    user: body.user,
    userAddress: body.userAddress,
    contact: body.contact,
    games: body.games,
    experience: body.experience,
    availability: body.availability,
    status: (body.status as GuardianStatus) || "待审核",
    note: body.note,
    meta: body.meta,
    createdAt: Date.now(),
  };

  await addGuardianApplication(application);
  await recordAudit(req, auth, "guardians.create", "guardian", application.id, {
    status: application.status,
  });

  return NextResponse.json(application, { status: 201 });
}
