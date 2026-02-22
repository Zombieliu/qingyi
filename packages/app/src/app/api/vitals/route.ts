import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, value, rating, page } = body;

    // Log for monitoring (picked up by Vercel/Sentry/log aggregator)
    console.log(
      JSON.stringify({
        type: "web_vital",
        name,
        value,
        rating,
        page,
        timestamp: Date.now(),
      })
    );

    // Alert on poor metrics
    if (rating === "poor") {
      console.warn(`[WEB_VITAL_POOR] ${name}=${value} on ${page}`);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
