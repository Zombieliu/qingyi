import { NextResponse } from "next/server";
import { listSupportTicketsByAddressEdgeRead } from "@/lib/edge-db/user-read-store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const items = await listSupportTicketsByAddressEdgeRead(address);

  return NextResponse.json({ items });
}
