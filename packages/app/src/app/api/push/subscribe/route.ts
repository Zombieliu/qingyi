import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Push subscription management.
 * Stores push subscriptions in a simple JSON field on a dedicated table.
 * For MVP, we store in AdminOrder meta or a separate KV.
 * Production: use a PushSubscription table.
 */

export async function POST(req: Request) {
  try {
    const { userAddress, subscription } = await req.json();
    if (!userAddress || !subscription?.endpoint) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }

    // Store subscription — for now, log it (production: persist to DB)
    console.log(
      JSON.stringify({
        type: "push_subscribe",
        userAddress,
        endpoint: subscription.endpoint,
        timestamp: Date.now(),
      })
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { endpoint } = await req.json();
    console.log(
      JSON.stringify({
        type: "push_unsubscribe",
        endpoint,
        timestamp: Date.now(),
      })
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}
