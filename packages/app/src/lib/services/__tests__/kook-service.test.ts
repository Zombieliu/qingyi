import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted runs before any imports, so env vars are set before module evaluation
vi.hoisted(() => {
  process.env.KOOK_BOT_TOKEN = "test-bot-token";
  process.env.KOOK_CHANNEL_ID = "test-channel-id";
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  sendChannelMessage,
  sendCardMessage,
  notifyKookNewOrder,
  notifyKookOrderStatus,
  notifyKookCompanionAccepted,
  notifyKookDailySummary,
  isKookEnabled,
} from "@/lib/services/kook-service";

beforeEach(() => {
  vi.clearAllMocks();
});

function mockKookSuccess(msgId = "msg-123") {
  mockFetch.mockResolvedValue({
    json: () => Promise.resolve({ code: 0, data: { msg_id: msgId } }),
  });
}

function mockKookError(message = "rate limited") {
  mockFetch.mockResolvedValue({
    json: () => Promise.resolve({ code: 40000, message }),
  });
}

describe("isKookEnabled", () => {
  it("returns true when both token and channel are set", () => {
    expect(isKookEnabled()).toBe(true);
  });
});

describe("sendChannelMessage", () => {
  it("sends a message and returns ok with msgId", async () => {
    mockKookSuccess("msg-abc");

    const result = await sendChannelMessage({ content: "Hello" });

    expect(result.ok).toBe(true);
    expect(result.msgId).toBe("msg-abc");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://www.kookapp.cn/api/v3/message/create",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bot test-bot-token",
        }),
      })
    );
  });

  it("uses default channel when channelId not provided", async () => {
    mockKookSuccess();

    await sendChannelMessage({ content: "test" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.target_id).toBe("test-channel-id");
  });

  it("uses custom channelId when provided", async () => {
    mockKookSuccess();

    await sendChannelMessage({ content: "test", channelId: "custom-ch" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.target_id).toBe("custom-ch");
  });

  it("defaults to KMarkdown type (9)", async () => {
    mockKookSuccess();

    await sendChannelMessage({ content: "test" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.type).toBe(9);
  });

  it("returns error on API failure", async () => {
    mockKookError("rate limited");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendChannelMessage({ content: "test" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("rate limited");
    vi.restoreAllMocks();
  });

  it("returns error with JSON.stringify when no message in API response", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ code: 40000 }),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendChannelMessage({ content: "test" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Kook API error");
    vi.restoreAllMocks();
  });
});

describe("sendCardMessage", () => {
  it("sends card message with type 10", async () => {
    mockKookSuccess();

    await sendCardMessage({
      cards: [{ type: "card", modules: [{ type: "divider" }] }],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.type).toBe(10);
  });
});

describe("notification helpers", () => {
  it("notifyKookNewOrder sends formatted message", async () => {
    mockKookSuccess();

    const result = await notifyKookNewOrder({
      orderId: "ORD-1",
      item: "三角洲陪玩",
      amount: 88,
      userAddress: "0xabcdef1234567890",
    });

    expect(result.ok).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.content).toContain("ORD-1");
    expect(body.content).toContain("88");
  });

  it("notifyKookNewOrder uses custom channelId", async () => {
    mockKookSuccess();

    await notifyKookNewOrder({
      orderId: "ORD-2",
      item: "陪玩",
      amount: 50,
      userAddress: "0xabcdef1234567890",
      channelId: "custom-channel",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.target_id).toBe("custom-channel");
  });

  it("notifyKookOrderStatus includes stage", async () => {
    mockKookSuccess();

    const result = await notifyKookOrderStatus({
      orderId: "ORD-1",
      item: "三角洲陪玩",
      stage: "已完成",
    });

    expect(result.ok).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.content).toContain("已完成");
  });

  it("notifyKookOrderStatus uses fallback emoji for unknown stage", async () => {
    mockKookSuccess();

    const result = await notifyKookOrderStatus({
      orderId: "ORD-1",
      item: "陪玩",
      stage: "未知状态",
    });

    expect(result.ok).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // Should use fallback emoji 📋
    expect(body.content).toContain("📋");
    expect(body.content).toContain("未知状态");
  });

  it("notifyKookCompanionAccepted sends companion info", async () => {
    mockKookSuccess();

    const result = await notifyKookCompanionAccepted({
      orderId: "ORD-1",
      companionName: "小明",
      item: "三角洲陪玩",
    });

    expect(result.ok).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.content).toContain("小明");
  });

  it("notifyKookDailySummary sends summary", async () => {
    mockKookSuccess();

    const result = await notifyKookDailySummary({
      date: "2025-01-01",
      totalOrders: 50,
      completedOrders: 45,
      revenue: 12345.67,
    });

    expect(result.ok).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.content).toContain("12345.67");
    expect(body.content).toContain("50");
  });
});

describe("kookRequest error paths", () => {
  it("sendChannelMessage handles fetch exception gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendChannelMessage({ content: "test" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("network error");
    vi.restoreAllMocks();
  });

  it("sendChannelMessage handles non-Error exception", async () => {
    mockFetch.mockRejectedValue("string error");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendChannelMessage({ content: "test" });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Unknown error");
    vi.restoreAllMocks();
  });
});

describe("isKookEnabled with missing config", () => {
  it("returns true when both token and channel are set (already tested)", () => {
    // BOT_TOKEN and DEFAULT_CHANNEL are set via vi.hoisted
    expect(isKookEnabled()).toBe(true);
  });
});

describe("kookRequest without BOT_TOKEN", () => {
  it("throws when BOT_TOKEN is not configured", async () => {
    vi.resetModules();
    // Override env vars to empty
    vi.stubEnv("KOOK_BOT_TOKEN", "");
    vi.stubEnv("KOOK_CHANNEL_ID", "");
    const mod = await import("@/lib/services/kook-service");
    const result = await mod.sendChannelMessage({ content: "test" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("KOOK_BOT_TOKEN not configured");
  });

  it("isKookEnabled returns false when token is empty", async () => {
    vi.resetModules();
    vi.stubEnv("KOOK_BOT_TOKEN", "");
    vi.stubEnv("KOOK_CHANNEL_ID", "");
    const mod = await import("@/lib/services/kook-service");
    expect(mod.isKookEnabled()).toBe(false);
  });
});
