import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Sentry dynamic import to prevent side effects
vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

import {
  trackOrderCreated,
  trackOrderCompleted,
  trackChainSyncResult,
  trackChainSyncFailed,
  trackWebhookFailed,
  trackSponsorGasLow,
  trackAuthSessionCreated,
  trackAuthFailed,
  trackCronCompleted,
  trackCronFailed,
  trackPaymentEvent,
  trackLedgerCredit,
} from "../business-events";

function lastCall(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const calls = spy.mock.calls;
  return JSON.parse(calls[calls.length - 1][0] as string);
}

describe("business-events", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("trackOrderCreated logs info with correct structure", () => {
    trackOrderCreated("ORD-1", "chain", 99.5);
    const logged = lastCall(logSpy);
    expect(logged.event).toBe("order.created");
    expect(logged.severity).toBe("info");
    expect(logged.service).toBe("qingyi-app");
    expect(logged.timestamp).toBeDefined();
    const data = logged.data as Record<string, unknown>;
    expect(data.orderId).toBe("ORD-1");
    expect(data.source).toBe("chain");
    expect(data.amount).toBe(99.5);
  });

  it("trackOrderCompleted logs info with duration", () => {
    trackOrderCompleted("ORD-2", 1500);
    const logged = lastCall(logSpy);
    expect(logged.event).toBe("order.completed");
    expect((logged.data as Record<string, unknown>).durationMs).toBe(1500);
  });

  it("trackChainSyncResult logs info", () => {
    trackChainSyncResult({
      total: 10,
      created: 3,
      updated: 7,
      mode: "incremental",
      durationMs: 500,
    });
    const logged = lastCall(logSpy);
    expect(logged.event).toBe("chain.sync.completed");
    expect((logged.data as Record<string, unknown>).total).toBe(10);
  });

  it("trackChainSyncFailed logs error", () => {
    trackChainSyncFailed("timeout");
    const logged = lastCall(errorSpy);
    expect(logged.event).toBe("chain.sync.failed");
    expect(logged.severity).toBe("error");
  });

  it("trackWebhookFailed logs warning", () => {
    trackWebhookFailed("ORD-3", "HTTP 500");
    const logged = lastCall(warnSpy);
    expect(logged.event).toBe("webhook.failed");
    expect(logged.severity).toBe("warning");
  });

  it("trackSponsorGasLow logs critical", () => {
    trackSponsorGasLow("0.01", "0.1");
    // critical uses console.error
    const logged = lastCall(errorSpy);
    expect(logged.event).toBe("sponsor.gas.low");
    expect(logged.severity).toBe("critical");
  });

  it("trackAuthSessionCreated truncates address", () => {
    trackAuthSessionCreated("0x1234567890abcdef1234567890abcdef");
    const logged = lastCall(logSpy);
    expect((logged.data as Record<string, unknown>).address).toBe("0x12345678...");
  });

  it("trackAuthFailed logs warning with reason", () => {
    trackAuthFailed("expired_timestamp", "1.2.3.4");
    const logged = lastCall(warnSpy);
    expect(logged.event).toBe("auth.failed");
    expect((logged.data as Record<string, unknown>).reason).toBe("expired_timestamp");
  });

  it("trackCronCompleted logs info", () => {
    trackCronCompleted("chain-sync", { synced: 5 }, 200);
    const logged = lastCall(logSpy);
    expect(logged.event).toBe("cron.chain-sync.completed");
    expect((logged.data as Record<string, unknown>).durationMs).toBe(200);
  });

  it("trackCronFailed logs error", () => {
    trackCronFailed("maintenance", "db timeout");
    const logged = lastCall(errorSpy);
    expect(logged.event).toBe("cron.maintenance.failed");
  });

  it("trackPaymentEvent logs info", () => {
    trackPaymentEvent("deposit", "ORD-4", 50, "CNY");
    const logged = lastCall(logSpy);
    expect(logged.event).toBe("payment.deposit");
    expect((logged.data as Record<string, unknown>).amount).toBe(50);
  });

  it("trackLedgerCredit truncates address", () => {
    trackLedgerCredit("0xabcdef1234567890", 100, "referral");
    const logged = lastCall(logSpy);
    expect(logged.event).toBe("ledger.credit");
    const data = logged.data as Record<string, unknown>;
    expect(data.userAddress).toBe("0xabcdef12...");
    expect(data.diamondAmount).toBe(100);
  });
});
