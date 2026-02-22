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
    limit: Number(sp.get("limit")) || 50,
    offset: Number(sp.get("offset")) || 0,
  });

  return NextResponse.json(result);
}

/** POST /api/growth/contacts — create or update contact */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, { role: "ops" });
  if ("status" in auth) return auth;

  const body = await req.json();
  const { action } = body;

  if (action === "create") {
    const contact = await findOrCreateContact(body);
    return NextResponse.json(contact, { status: 201 });
  }

  if (action === "assign" && body.contactId && body.assignedTo) {
    const updated = await assignContact(body.contactId, body.assignedTo);
    return NextResponse.json(updated);
  }

  if (action === "tag" && body.contactId && body.tags) {
    const updated = await tagContact(body.contactId, body.tags);
    return NextResponse.json(updated);
  }

  if (action === "score" && body.contactId && body.score !== undefined) {
    const updated = await scoreContact(body.contactId, body.score);
    return NextResponse.json(updated);
  }

  if (action === "lifecycle" && body.contactId && body.lifecycle) {
    const updated = await updateContactLifecycle(body.contactId, body.lifecycle);
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
