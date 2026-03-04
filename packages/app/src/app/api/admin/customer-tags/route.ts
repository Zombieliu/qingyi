import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/shared/api-validation";
import { requireAdmin } from "@/lib/admin/admin-auth";

const addTagSchema = z.object({
  userAddress: z.string().min(1),
  tag: z.enum([
    "difficult",
    "slow_pay",
    "rude",
    "no_show",
    "frequent_dispute",
    "vip_treat",
    "other",
  ]),
  note: z.string().optional(),
  severity: z.number().int().min(1).max(5).optional(),
});

/** GET /api/admin/customer-tags — list tagged customers or get tags for one */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;

  const { getCustomerTags, listTaggedCustomers } =
    await import("@/lib/services/customer-tag-service");

  const userAddress = req.nextUrl.searchParams.get("userAddress");

  if (userAddress) {
    const summary = await getCustomerTags(userAddress);
    return NextResponse.json(summary);
  }

  const limit = Number(req.nextUrl.searchParams.get("limit")) || 50;
  const offset = Number(req.nextUrl.searchParams.get("offset")) || 0;
  const list = await listTaggedCustomers({ limit, offset });
  return NextResponse.json(list);
}

/** POST /api/admin/customer-tags — add a tag (admin) */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const { addCustomerTag } = await import("@/lib/services/customer-tag-service");
  const parsed = await parseBody(req, addTagSchema);
  if (!parsed.success) return parsed.response;
  const { userAddress, tag, note, severity } = parsed.data;

  const created = await addCustomerTag({
    userAddress,
    tag,
    note,
    severity: severity ?? 2,
    reportedBy: "admin",
    reportedByRole: "admin",
  });

  return NextResponse.json(created, { status: 201 });
}

/** DELETE /api/admin/customer-tags?id=xxx — deactivate a tag */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const { removeCustomerTag } = await import("@/lib/services/customer-tag-service");
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await removeCustomerTag(id);
  return NextResponse.json({ ok: true });
}
