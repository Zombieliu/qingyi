import { NextResponse } from "next/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import {
  getMemberByAddressEdgeRead,
  getMembershipTierByIdEdgeRead,
} from "@/lib/edge-db/user-read-store";
import { requireUserAuth } from "@/lib/auth/user-auth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userAddress = normalizeSuiAddress((searchParams.get("userAddress") || "").trim());
  if (!userAddress) {
    return NextResponse.json({ member: null, tier: null });
  }
  if (!isValidSuiAddress(userAddress)) {
    return NextResponse.json({ error: "invalid userAddress" }, { status: 400 });
  }
  const auth = await requireUserAuth(req, { intent: "vip:status:read", address: userAddress });
  if (!auth.ok) return auth.response;

  const member = await getMemberByAddressEdgeRead(auth.address);
  if (!member) {
    return NextResponse.json({ member: null, tier: null });
  }

  const tier = member.tierId ? await getMembershipTierByIdEdgeRead(member.tierId) : null;
  return NextResponse.json({ member, tier });
}
