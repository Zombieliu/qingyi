import { NextResponse } from "next/server";
import { getMemberByAddress, getMembershipTierById } from "@/lib/admin-store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userAddress = (searchParams.get("userAddress") || "").trim();
  if (!userAddress) {
    return NextResponse.json({ member: null, tier: null });
  }

  const member = await getMemberByAddress(userAddress);
  if (!member) {
    return NextResponse.json({ member: null, tier: null });
  }

  const tier = member.tierId ? await getMembershipTierById(member.tierId) : null;
  return NextResponse.json({ member, tier });
}
