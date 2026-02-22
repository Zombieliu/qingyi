import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { getContact, addFollowUp } from "@/lib/services/growth-os-service";

/** GET /api/growth/contacts/[id] — contact detail with journey */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if ("status" in auth) return auth;

  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(contact);
}

/** POST /api/growth/contacts/[id] — add follow-up */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, { role: "ops" });
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json();

  const followUp = await addFollowUp({
    contactId: id,
    action: body.action || "note",
    content: body.content,
    result: body.result,
    nextFollowAt: body.nextFollowAt ? new Date(body.nextFollowAt) : undefined,
    operatorId: body.operatorId || "admin",
  });

  return NextResponse.json(followUp, { status: 201 });
}
