import { NextResponse } from "next/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { getReferralByInvitee, queryReferralsByInviter } from "@/lib/admin/admin-store";
import { requireUserAuth } from "@/lib/auth/user-auth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const addressRaw = searchParams.get("address") || "";
  const address = addressRaw ? normalizeSuiAddress(addressRaw) : "";
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }

  const auth = await requireUserAuth(req, { intent: "referral:status", address });
  if (!auth.ok) return auth.response;

  const [invitedBy, myInvites] = await Promise.all([
    getReferralByInvitee(address),
    queryReferralsByInviter(address),
  ]);

  const totalReward = myInvites
    .filter((r) => r.status === "rewarded")
    .reduce((sum, r) => sum + (r.rewardInviter ?? 0), 0);

  // Generate refCode: last 8 hex chars of address (without 0x prefix)
  const refCode = address.slice(-8);

  return NextResponse.json({
    refCode,
    invitedBy: invitedBy
      ? {
          inviterAddress: invitedBy.inviterAddress,
          status: invitedBy.status,
          rewardInvitee: invitedBy.rewardInvitee,
        }
      : null,
    inviteCount: myInvites.length,
    rewardedCount: myInvites.filter((r) => r.status === "rewarded").length,
    totalReward,
    invites: myInvites.map((r) => ({
      inviteeAddress: r.inviteeAddress,
      status: r.status,
      rewardInviter: r.rewardInviter,
      createdAt: r.createdAt,
      rewardedAt: r.rewardedAt,
    })),
  });
}
