import { NextResponse } from "next/server";

/**
 * Kook Webhook endpoint.
 * Receives events from Kook bot (challenge verification + message events).
 *
 * Setup: In Kook developer portal, set webhook URL to:
 *   https://your-domain.com/api/kook/webhook
 */

const KOOK_VERIFY_TOKEN = process.env.KOOK_VERIFY_TOKEN || "";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Challenge verification (Kook sends this to verify webhook URL)
    if (body.s === 0 && body.d?.type === 255 && body.d?.channel_type === "WEBHOOK_CHALLENGE") {
      return NextResponse.json({ challenge: body.d.challenge });
    }

    // Verify token if configured
    if (KOOK_VERIFY_TOKEN && body.d?.verify_token !== KOOK_VERIFY_TOKEN) {
      return NextResponse.json({ error: "invalid token" }, { status: 401 });
    }

    // Handle message events
    if (body.s === 0 && body.d?.type === 1) {
      const content = body.d.content as string;
      const authorId = body.d.author_id as string;

      // Bot commands
      if (content.startsWith("/")) {
        const command = content.split(" ")[0].toLowerCase();

        switch (command) {
          case "/status":
            // Return platform status
            console.log(
              JSON.stringify({
                type: "kook_command",
                command: "status",
                authorId,
                timestamp: Date.now(),
              })
            );
            break;

          case "/help":
            console.log(
              JSON.stringify({
                type: "kook_command",
                command: "help",
                authorId,
                timestamp: Date.now(),
              })
            );
            break;

          default:
            break;
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}
