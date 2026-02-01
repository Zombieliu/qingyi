import { NextResponse } from "next/server";
import crypto from "crypto";
import { addMembershipRequest, getMembershipTierById, listActiveMembershipTiers } from "@/lib/admin-store";
import type { AdminMembershipRequest, MembershipRequestStatus } from "@/lib/admin-types";

export async function POST(req: Request) {
  let body: {
    userAddress?: string;
    userName?: string;
    contact?: string;
    tierId?: string;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userAddress = body.userAddress?.trim();
  if (!userAddress) {
    return NextResponse.json({ error: "userAddress required" }, { status: 400 });
  }

  let tierId = body.tierId?.trim() || "";
  let tier = tierId ? await getMembershipTierById(tierId) : null;
  if (!tier) {
    const tiers = await listActiveMembershipTiers();
    tier = tiers[0] || null;
    tierId = tier?.id || "";
  }
  if (!tier) {
    return NextResponse.json({ error: "no active tier" }, { status: 400 });
  }

  const request: AdminMembershipRequest = {
    id: `VIP-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    userAddress,
    userName: body.userName?.trim(),
    contact: body.contact?.trim(),
    tierId: tierId,
    tierName: tier.name,
    status: "待审核" as MembershipRequestStatus,
    createdAt: Date.now(),
  };

  await addMembershipRequest(request);
  return NextResponse.json({ id: request.id, status: request.status });
}
