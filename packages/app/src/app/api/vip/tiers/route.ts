import { NextResponse } from "next/server";
import { listActiveMembershipTiers } from "@/lib/admin-store";

export async function GET() {
  const tiers = await listActiveMembershipTiers();
  return NextResponse.json(tiers);
}
