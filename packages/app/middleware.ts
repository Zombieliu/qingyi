import { NextResponse, type NextRequest } from "next/server";

function generateTraceId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function middleware(req: NextRequest) {
  const existing = req.headers.get("x-trace-id") || req.headers.get("x-request-id");
  const traceId = existing || generateTraceId();
  const requestHeaders = new Headers(req.headers);
  if (!existing) {
    requestHeaders.set("x-trace-id", traceId);
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-trace-id", traceId);
  return response;
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*"],
};
