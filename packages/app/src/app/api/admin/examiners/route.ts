import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/admin/admin-auth";
import {
  addExaminerApplication,
  queryExaminerApplications,
  queryExaminerApplicationsCursor,
} from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import type { AdminExaminerApplication, ExaminerStatus } from "@/lib/admin/admin-types";
import { decodeCursorParam, encodeCursorParam } from "@/lib/cursor-utils";

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
    const result = await queryExaminerApplicationsCursor({
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

  const result = await queryExaminerApplications({ page, pageSize, status, q });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  let body: Partial<AdminExaminerApplication> = {};
  try {
    body = (await req.json()) as Partial<AdminExaminerApplication>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.user && !body.contact) {
    return NextResponse.json({ error: "user or contact required" }, { status: 400 });
  }

  const application: AdminExaminerApplication = {
    id: body.id || `EXA-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    user: body.user,
    userAddress: body.userAddress,
    contact: body.contact,
    games: body.games,
    rank: body.rank,
    liveTime: body.liveTime,
    status: (body.status as ExaminerStatus) || "待审核",
    note: body.note,
    meta: body.meta,
    createdAt: Date.now(),
  };

  await addExaminerApplication(application);
  await recordAudit(req, auth, "examiners.create", "examiner", application.id, {
    status: application.status,
  });

  return NextResponse.json(application, { status: 201 });
}
