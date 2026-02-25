import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { createDisputeTicket } from "../dispute-ticket-client";

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue(new Response("ok"));
});

describe("createDisputeTicket", () => {
  it("sends POST to /api/support with correct payload", () => {
    createDisputeTicket({
      orderId: "ORD-1",
      evidence: "服务质量差",
      userAddress: "0xabc",
      orderItem: "王者荣耀陪练",
      orderAmount: 100,
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String),
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.topic).toBe("链上争议");
    expect(body.meta).toEqual({
      type: "chain_dispute",
      orderId: "ORD-1",
      evidence: "服务质量差",
      orderItem: "王者荣耀陪练",
      orderAmount: 100,
    });
    expect(body.message).toContain("ORD-1");
    expect(body.message).toContain("服务质量差");
    expect(body.userAddress).toBe("0xabc");
  });

  it("does not throw when fetch fails", () => {
    mockFetch.mockRejectedValue(new Error("network error"));

    expect(() =>
      createDisputeTicket({
        orderId: "ORD-2",
        evidence: "test",
      })
    ).not.toThrow();
  });

  it("works without optional fields", () => {
    createDisputeTicket({
      orderId: "ORD-3",
      evidence: "reason",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.meta.orderId).toBe("ORD-3");
    expect(body.userAddress).toBeUndefined();
    expect(body.meta.orderItem).toBeUndefined();
    expect(body.meta.orderAmount).toBeUndefined();
  });
});
