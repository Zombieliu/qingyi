import { NextRequest, NextResponse } from "next/server";
import {
  getCustomerTags,
  addCustomerTag,
  type CustomerTagType,
} from "@/lib/services/customer-tag-service";

const VALID_TAGS: CustomerTagType[] = [
  "difficult",
  "slow_pay",
  "rude",
  "no_show",
  "frequent_dispute",
  "vip_treat",
  "other",
];

/** GET /api/companion/customer-tags?userAddress=xxx — get tags for a customer */
export async function GET(req: NextRequest) {
  const userAddress = req.nextUrl.searchParams.get("userAddress");
  if (!userAddress) return NextResponse.json({ error: "userAddress required" }, { status: 400 });

  const summary = await getCustomerTags(userAddress);
  return NextResponse.json(summary);
}

/** POST /api/companion/customer-tags — add a tag */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userAddress, tag, note, severity, reportedBy } = body;

  if (!userAddress || !tag || !reportedBy) {
    return NextResponse.json(
      { error: "userAddress, tag, and reportedBy required" },
      { status: 400 }
    );
  }
  if (!VALID_TAGS.includes(tag)) {
    return NextResponse.json(
      { error: `Invalid tag. Valid: ${VALID_TAGS.join(", ")}` },
      { status: 400 }
    );
  }
  if (severity !== undefined && (severity < 1 || severity > 3)) {
    return NextResponse.json({ error: "severity must be 1-3" }, { status: 400 });
  }

  // Prevent tagging yourself
  if (userAddress === reportedBy) {
    return NextResponse.json({ error: "Cannot tag yourself" }, { status: 400 });
  }

  const created = await addCustomerTag({
    userAddress,
    tag,
    note,
    severity: severity ?? 1,
    reportedBy,
    reportedByRole: "companion",
  });

  return NextResponse.json(created, { status: 201 });
}
