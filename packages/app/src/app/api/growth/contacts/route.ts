import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import {
  listContacts,
  findOrCreateContact,
  assignContact,
  tagContact,
  scoreContact,
  updateContactLifecycle,
} from "@/lib/services/growth-os-service";
import { contactActionSchema } from "@/lib/services/growth-validation";
import { recordAudit } from "@/lib/admin/admin-audit";

/** GET /api/growth/contacts?lifecycle=lead&search=xxx&limit=50&offset=0 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if ("status" in auth) return auth;

  const sp = req.nextUrl.searchParams;
  const result = await listContacts({
    lifecycle: sp.get("lifecycle") || undefined,
    source: sp.get("source") || undefined,
    assignedTo: sp.get("assignedTo") || undefined,
    search: sp.get("search") || undefined,
    limit: Math.min(Number(sp.get("limit")) || 50, 100),
    offset: Number(sp.get("offset")) || 0,
  });

  return NextResponse.json(result);
}

/** POST /api/growth/contacts — create or update contact */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, { role: "ops" });
  if ("status" in auth) return auth;

  const body = await req.json();
  const parsed = contactActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  if (data.action === "create") {
    const contact = await findOrCreateContact(data);
    await recordAudit({ action: "growth.contact.create", target: contact.id, detail: data });
    return NextResponse.json(contact, { status: 201 });
  }

  if (data.action === "assign") {
    const updated = await assignContact(data.contactId, data.assignedTo);
    await recordAudit({ action: "growth.contact.assign", target: data.contactId, detail: data });
    return NextResponse.json(updated);
  }

  if (data.action === "tag") {
    const updated = await tagContact(data.contactId, data.tags);
    await recordAudit({ action: "growth.contact.tag", target: data.contactId, detail: data });
    return NextResponse.json(updated);
  }

  if (data.action === "score") {
    const updated = await scoreContact(data.contactId, data.score);
    return NextResponse.json(updated);
  }

  if (data.action === "lifecycle") {
    const updated = await updateContactLifecycle(data.contactId, data.lifecycle);
    await recordAudit({ action: "growth.contact.lifecycle", target: data.contactId, detail: data });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
