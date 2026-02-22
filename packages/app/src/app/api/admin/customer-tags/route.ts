import { NextRequest, NextResponse } from "next/server";
import {
  getCustomerTags,
  addCustomerTag,
  removeCustomerTag,
  listTaggedCustomers,
  type CustomerTagType,
} from "@/lib/services/customer-tag-service";
import { requireAdmin } from "@/lib/admin/admin-auth";

const VALID_TAGS: CustomerTagType[] = [
  "difficult",
  "slow_pay",
  "rude",
  "no_show",
  "frequent_dispute",
  "vip_treat",
  "other",
];

/** GET /api/admin/customer-tags — list tagged customers or get tags for one */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if ("status" in auth) return auth;

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
  if ("status" in auth) return auth;

  const body = await req.json();
  const { userAddress, tag, note, severity } = body;

  if (!userAddress || !tag) {
    return NextResponse.json({ error: "userAddress and tag required" }, { status: 400 });
  }
  if (!VALID_TAGS.includes(tag)) {
    return NextResponse.json({ error: "Invalid tag" }, { status: 400 });
  }

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
  if ("status" in auth) return auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await removeCustomerTag(id);
  return NextResponse.json({ ok: true });
}
