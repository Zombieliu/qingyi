import { NextResponse } from "next/server";
import { savePushSubscription, removePushSubscription } from "@/lib/services/push-service";

export async function POST(req: Request) {
  try {
    const { userAddress, subscription } = await req.json();
    if (!userAddress || !subscription?.endpoint || !subscription?.keys) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }

    await savePushSubscription(userAddress, {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { endpoint } = await req.json();
    if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
    await removePushSubscription(endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}
