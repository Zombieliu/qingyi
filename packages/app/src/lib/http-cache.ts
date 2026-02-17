import "server-only";
import { NextResponse } from "next/server";

export function getIfNoneMatch(req: Request) {
  return req.headers.get("if-none-match") || "";
}

export function jsonWithEtag(data: unknown, etag: string, cacheControl: string) {
  const res = NextResponse.json(data);
  res.headers.set("ETag", etag);
  res.headers.set("Cache-Control", cacheControl);
  return res;
}

export function notModified(etag: string, cacheControl: string) {
  const res = new NextResponse(null, { status: 304 });
  res.headers.set("ETag", etag);
  res.headers.set("Cache-Control", cacheControl);
  return res;
}
