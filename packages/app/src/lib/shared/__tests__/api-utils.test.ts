import { describe, it, expect } from "vitest";
import { getClientIp } from "../api-utils";

function makeRequest(headers: Record<string, string>): Request {
  return {
    headers: new Headers(headers),
  } as unknown as Request;
}

describe("getClientIp", () => {
  it("returns first IP from x-forwarded-for", () => {
    const req = makeRequest({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("returns x-real-ip when x-forwarded-for is absent", () => {
    const req = makeRequest({ "x-real-ip": "10.0.0.1" });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  it("returns 'unknown' when no IP headers present", () => {
    const req = makeRequest({});
    expect(getClientIp(req)).toBe("unknown");
  });
});
