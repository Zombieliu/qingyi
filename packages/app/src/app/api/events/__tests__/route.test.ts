import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserSessionFromToken: vi.fn(),
  getLatestEvent: vi.fn(),
  getLatestNotificationEvent: vi.fn(),
}));

vi.mock("@/lib/auth/user-auth", () => ({
  getUserSessionFromToken: mocks.getUserSessionFromToken,
}));
vi.mock("@/lib/realtime", () => ({
  getLatestEvent: mocks.getLatestEvent,
  getLatestNotificationEvent: mocks.getLatestNotificationEvent,
}));

import { GET } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

describe("GET /api/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when address is missing", async () => {
    const req = new Request("http://localhost/api/events");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("address required");
  });

  it("returns 401 when token session address does not match", async () => {
    mocks.getUserSessionFromToken.mockResolvedValue({ address: "0xother" });
    const req = new Request(`http://localhost/api/events?address=${VALID_ADDRESS}`, {
      headers: { Authorization: "Bearer test-token" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns SSE stream when address is provided without token", async () => {
    const req = new Request(`http://localhost/api/events?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("returns SSE stream when token matches address", async () => {
    mocks.getUserSessionFromToken.mockResolvedValue({ address: VALID_ADDRESS });
    const req = new Request(`http://localhost/api/events?address=${VALID_ADDRESS}`, {
      headers: { Authorization: `Bearer valid-token` },
    });
    const res = await GET(req);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("returns 401 when session is null", async () => {
    mocks.getUserSessionFromToken.mockResolvedValue(null);
    const req = new Request(`http://localhost/api/events?address=${VALID_ADDRESS}`, {
      headers: { Authorization: "Bearer bad-token" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("extracts token from cookie when no Authorization header", async () => {
    mocks.getUserSessionFromToken.mockResolvedValue({ address: VALID_ADDRESS });
    const req = new Request(`http://localhost/api/events?address=${VALID_ADDRESS}`, {
      headers: { cookie: `user_session=cookie-token; other=val` },
    });
    const res = await GET(req);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(mocks.getUserSessionFromToken).toHaveBeenCalledWith("cookie-token");
  });

  it("sends connected event and polls for order events", async () => {
    vi.useFakeTimers();
    const orderEvent = { type: "status_change", orderId: "ORD-1", timestamp: 1000 };
    mocks.getLatestEvent.mockResolvedValue(orderEvent);
    mocks.getLatestNotificationEvent.mockResolvedValue(null);
    const req = new Request(`http://localhost/api/events?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Read initial connected event
    const { value: chunk1 } = await reader.read();
    const text1 = decoder.decode(chunk1);
    expect(text1).toContain("event: connected");
    expect(text1).toContain(VALID_ADDRESS);

    // Advance timer to trigger first poll
    await vi.advanceTimersByTimeAsync(1000);

    // Read order event
    const { value: chunk2 } = await reader.read();
    const text2 = decoder.decode(chunk2);
    expect(text2).toContain("event: order");

    reader.cancel();
    vi.useRealTimers();
  });

  it("sends notification events", async () => {
    vi.useFakeTimers();
    mocks.getLatestEvent.mockResolvedValue(null);
    const notifEvent = { type: "new_message", timestamp: 2000 };
    mocks.getLatestNotificationEvent.mockResolvedValue(notifEvent);
    const req = new Request(`http://localhost/api/events?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Read connected event
    await reader.read();

    // Advance timer to trigger poll
    await vi.advanceTimersByTimeAsync(1000);

    const { value: chunk } = await reader.read();
    const text = decoder.decode(chunk);
    expect(text).toContain("event: notification");

    reader.cancel();
    vi.useRealTimers();
  });

  it("handles Redis errors gracefully during polling", async () => {
    vi.useFakeTimers();
    mocks.getLatestEvent.mockRejectedValue(new Error("Redis error"));
    mocks.getLatestNotificationEvent.mockRejectedValue(new Error("Redis error"));
    const req = new Request(`http://localhost/api/events?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    const reader = res.body!.getReader();

    // Read connected event
    await reader.read();

    // Advance timer to trigger poll - should not throw
    await vi.advanceTimersByTimeAsync(1000);

    // Should still get heartbeat
    const { value: chunk } = await reader.read();
    const text = new TextDecoder().decode(chunk);
    expect(text).toContain("heartbeat");

    reader.cancel();
    vi.useRealTimers();
  });

  it("stops polling when stream is cancelled", async () => {
    vi.useFakeTimers();
    mocks.getLatestEvent.mockResolvedValue(null);
    mocks.getLatestNotificationEvent.mockResolvedValue(null);
    const req = new Request(`http://localhost/api/events?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    const reader = res.body!.getReader();

    // Read connected event
    await reader.read();

    // Cancel the stream
    await reader.cancel();

    // Advance timer - poll should not run
    await vi.advanceTimersByTimeAsync(5000);

    // getLatestEvent should not have been called after cancel
    // (it may have been called once during the first poll)
    const callCount = mocks.getLatestEvent.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.getLatestEvent.mock.calls.length).toBe(callCount);

    vi.useRealTimers();
  });

  it("does not send duplicate events with same timestamp", async () => {
    vi.useFakeTimers();
    const orderEvent = { type: "status_change", orderId: "ORD-1", timestamp: 1000 };
    mocks.getLatestEvent.mockResolvedValue(orderEvent);
    mocks.getLatestNotificationEvent.mockResolvedValue(null);
    const req = new Request(`http://localhost/api/events?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Read connected event
    await reader.read();

    // First poll
    await vi.advanceTimersByTimeAsync(1000);
    const { value: chunk1 } = await reader.read();
    expect(decoder.decode(chunk1)).toContain("event: order");

    // Second poll with same event - should only get heartbeat
    await vi.advanceTimersByTimeAsync(3000);
    const { value: chunk2 } = await reader.read();
    const text2 = decoder.decode(chunk2);
    expect(text2).toContain("heartbeat");
    expect(text2).not.toContain("event: order");

    reader.cancel();
    vi.useRealTimers();
  });
});
