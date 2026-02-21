import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  addMembershipRequest,
  getMembershipTierById,
  listActiveMembershipTiers,
} from "@/lib/admin/admin-store";
import type { AdminMembershipRequest, MembershipRequestStatus } from "@/lib/admin/admin-types";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { z } from "zod";
import { parseBodyRaw } from "@/lib/shared/api-validation";

const vipRequestSchema = z.object({
  userAddress: z.string().trim().min(1),
  userName: z.string().trim().optional(),
  contact: z.string().trim().optional(),
  tierId: z.string().trim().optional(),
});

export async function POST(req: Request) {
  const parsed = await parseBodyRaw(req, vipRequestSchema);
  if (!parsed.success) return parsed.response;
  const { data: body, rawBody } = parsed;

  const userAddress = normalizeSuiAddress(body.userAddress);
  if (!userAddress) {
    return NextResponse.json({ error: "userAddress required" }, { status: 400 });
  }
  if (!isValidSuiAddress(userAddress)) {
    return NextResponse.json({ error: "invalid userAddress" }, { status: 400 });
  }
  const auth = await requireUserAuth(req, {
    intent: "vip:request:create",
    address: userAddress,
    body: rawBody,
  });
  if (!auth.ok) return auth.response;

  let tierId = body.tierId || "";
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
    userName: body.userName,
    contact: body.contact,
    tierId: tierId,
    tierName: tier.name,
    status: "待审核" as MembershipRequestStatus,
    createdAt: Date.now(),
  };

  await addMembershipRequest(request);
  return NextResponse.json({ id: request.id, status: request.status });
}
