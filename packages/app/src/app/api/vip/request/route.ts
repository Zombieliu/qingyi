import { NextResponse } from "next/server";
import { randomInt } from "@/lib/shared/runtime-crypto";
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
import { apiBadRequest } from "@/lib/shared/api-response";

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
    return apiBadRequest("userAddress required");
  }
  if (!isValidSuiAddress(userAddress)) {
    return apiBadRequest("invalid userAddress");
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
    return apiBadRequest("no active tier");
  }

  const request: AdminMembershipRequest = {
    id: `VIP-${Date.now()}-${randomInt(1000, 9999)}`,
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
