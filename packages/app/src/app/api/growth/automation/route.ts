import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import {
  listAutomations,
  createAutomation,
  toggleAutomation,
} from "@/lib/services/growth-os-service";

/** GET /api/growth/automation — list all rules */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if ("status" in auth) return auth;

  const rules = await listAutomations();
  return NextResponse.json(rules);
}

/** POST /api/growth/automation — create or toggle */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, { role: "admin" });
  if ("status" in auth) return auth;

  const body = await req.json();

  // Toggle existing rule
  if (body.id && body.active !== undefined) {
    const updated = await toggleAutomation(body.id, body.active);
    return NextResponse.json(updated);
  }

  // Create new rule
  if (!body.name || !body.trigger || !body.action) {
    return NextResponse.json({ error: "name, trigger, and action required" }, { status: 400 });
  }

  const rule = await createAutomation({
    name: body.name,
    description: body.description,
    trigger: body.trigger,
    action: body.action,
    priority: body.priority,
  });

  return NextResponse.json(rule, { status: 201 });
}
