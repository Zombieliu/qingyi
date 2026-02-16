import { NextResponse } from "next/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { getMemberByAddress, getMembershipTierById } from "@/lib/admin-store";
import { requireUserAuth } from "@/lib/user-auth";

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

  const member = await getMemberByAddress(auth.address);
  if (!member) {
    return NextResponse.json({ member: null, tier: null });
  }

  const tier = member.tierId ? await getMembershipTierById(member.tierId) : null;
  return NextResponse.json({ member, tier });
}
