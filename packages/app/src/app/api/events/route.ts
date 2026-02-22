import { getUserSessionFromToken } from "@/lib/auth/user-auth";
import { getLatestEvent } from "@/lib/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

/**
 * SSE 端点：订单状态实时推送
 *
 * GET /api/events?address={userAddress}
 *
 * 客户端用 EventSource 连接，服务端每 3 秒检查 Redis 是否有新事件。
 * Vercel Pro 60 秒超时后连接断开，EventSource 自动重连。
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");

  if (!address) {
    return new Response(JSON.stringify({ error: "address required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Auth: check bearer token or cookie session
  const token =
    getBearerToken(req) || req.headers.get("cookie")?.match(/user_session=([^;]+)/)?.[1];
  if (token) {
    const session = await getUserSessionFromToken(token);
    if (!session || session.address !== address) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
  // If no token, allow connection (public SSE for logged-in users via EventSource which can't set headers)

  const encoder = new TextEncoder();
  let lastTimestamp = 0;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ address })}\n\n`)
      );

      const poll = async () => {
        if (closed) return;

        try {
          const event = await getLatestEvent(address);
          if (event && event.timestamp > lastTimestamp) {
            lastTimestamp = event.timestamp;
            controller.enqueue(encoder.encode(`event: order\ndata: ${JSON.stringify(event)}\n\n`));
          }
        } catch {
          // Redis error, skip this cycle
        }

        // Send heartbeat to keep connection alive
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        } catch {
          closed = true;
          return;
        }

        if (!closed) {
          setTimeout(poll, 3000);
        }
      };

      // Start polling after a short delay
      setTimeout(poll, 1000);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
