import { NextResponse } from "next/server";
import crypto from "crypto";
import { addMembershipRequest, getMembershipTierById, listActiveMembershipTiers } from "@/lib/admin/admin-store";
import type { AdminMembershipRequest, MembershipRequestStatus } from "@/lib/admin/admin-types";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { requireUserAuth } from "@/lib/auth/user-auth";

export async function POST(req: Request) {
  let rawBody = "";
  let body: {
    userAddress?: string;
    userName?: string;
    contact?: string;
    tierId?: string;
  } = {};
  try {
    rawBody = await req.text();
    body = rawBody ? (JSON.parse(rawBody) as typeof body) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userAddressRaw = body.userAddress?.trim() || "";
  const userAddress = normalizeSuiAddress(userAddressRaw);
  if (!userAddress) {
    return NextResponse.json({ error: "userAddress required" }, { status: 400 });
  }
  if (!isValidSuiAddress(userAddress)) {
    return NextResponse.json({ error: "invalid userAddress" }, { status: 400 });
  }
  const auth = await requireUserAuth(req, { intent: "vip:request:create", address: userAddress, body: rawBody });
  if (!auth.ok) return auth.response;

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
    userAddress: auth.address,
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
