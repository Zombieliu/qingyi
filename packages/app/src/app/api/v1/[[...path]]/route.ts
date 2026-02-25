import { type NextRequest, NextResponse } from "next/server";

/**
 * API v1 版本代理
 *
 * 将 /api/v1/xxx 请求 rewrite 到 /api/xxx，
 * 并附加 x-api-version: v1 header，使下游路由可感知版本。
 * 现有 API 无需任何改动，v1 仅作为兼容层。
 */
function proxyToCurrentApi(req: NextRequest) {
  const url = new URL(req.url);
  const newPath = url.pathname.replace("/api/v1/", "/api/");
  const newUrl = new URL(newPath + url.search, url.origin);

  const headers = new Headers(req.headers);
  headers.set("x-api-version", "v1");

  return NextResponse.rewrite(newUrl, {
    request: { headers },
  });
}

export const GET = proxyToCurrentApi;
export const POST = proxyToCurrentApi;
export const PUT = proxyToCurrentApi;
export const DELETE = proxyToCurrentApi;
export const PATCH = proxyToCurrentApi;
