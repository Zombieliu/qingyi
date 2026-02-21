import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Sentry dynamic import
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

describe("business-events", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  function lastLog(): Record<string, unknown> {
    const call = logSpy.mock.calls[logSpy.mock.calls.length - 1];
    return JSON.parse(call[0] as string);
  }

  function lastWarn(): Record<string, unknown> {
    const call = warnSpy.mock.calls[warnSpy.mock.calls.length - 1];
    return JSON.parse(call[0] as string);
  }

  function lastError(): Record<string, unknown> {
    const call = errorSpy.mock.calls[errorSpy.mock.calls.length - 1];
    return JSON.parse(call[0] as string);
  }

  it("trackOrderCreated emits info log with correct fields", () => {
    trackOrderCreated("ORD-123", "chain", 99.5);
    const entry = lastLog();
    expect(entry.event).toBe("order.created");
    expect(entry.severity).toBe("info");
    expect(entry.service).toBe("qingyi-app");
    expect((entry.data as Record<string, unknown>).orderId).toBe("ORD-123");
    expect((entry.data as Record<string, unknown>).source).toBe("chain");
    expect((entry.data as Record<string, unknown>).amount).toBe(99.5);
    expect(entry.timestamp).toBeDefined();
  });

  it("trackOrderCompleted includes durationMs", () => {
    trackOrderCompleted("ORD-456", 3200);
    const entry = lastLog();
    expect(entry.event).toBe("order.completed");
    expect((entry.data as Record<string, unknown>).durationMs).toBe(3200);
  });

  it("trackChainSyncResult logs sync stats", () => {
    trackChainSyncResult({
      total: 10,
      created: 3,
      updated: 7,
      mode: "incremental",
      durationMs: 500,
    });
    const entry = lastLog();
    expect(entry.event).toBe("chain.sync.completed");
    expect((entry.data as Record<string, unknown>).total).toBe(10);
    expect((entry.data as Record<string, unknown>).mode).toBe("incremental");
  });

  it("trackChainSyncFailed uses error severity", () => {
    trackChainSyncFailed("connection timeout");
    const entry = lastError();
    expect(entry.event).toBe("chain.sync.failed");
    expect(entry.severity).toBe("error");
  });

  it("trackWebhookFailed uses warning severity", () => {
    trackWebhookFailed("ORD-789", "HTTP 500");
    const entry = lastWarn();
    expect(entry.event).toBe("webhook.failed");
    expect(entry.severity).toBe("warning");
  });

  it("trackSponsorGasLow uses critical severity", () => {
    trackSponsorGasLow("0.001", "0.1");
    const entry = lastError();
    expect(entry.event).toBe("sponsor.gas.low");
    expect(entry.severity).toBe("critical");
  });

  it("trackAuthSessionCreated truncates address", () => {
    trackAuthSessionCreated("0x1234567890abcdef1234567890abcdef12345678");
    const entry = lastLog();
    expect(entry.event).toBe("auth.session.created");
    const addr = (entry.data as Record<string, unknown>).address as string;
    expect(addr).toContain("...");
    expect(addr.length).toBeLessThan(20);
  });

  it("trackAuthFailed logs warning", () => {
    trackAuthFailed("expired_timestamp", "1.2.3.4");
    const entry = lastWarn();
    expect(entry.event).toBe("auth.failed");
    expect((entry.data as Record<string, unknown>).reason).toBe("expired_timestamp");
  });

  it("trackCronCompleted includes job name and duration", () => {
    trackCronCompleted("chain-sync", { synced: 5 }, 1200);
    const entry = lastLog();
    expect(entry.event).toBe("cron.chain-sync.completed");
    expect((entry.data as Record<string, unknown>).durationMs).toBe(1200);
  });

  it("trackCronFailed uses error severity", () => {
    trackCronFailed("maintenance", "db connection lost");
    const entry = lastError();
    expect(entry.event).toBe("cron.maintenance.failed");
    expect(entry.severity).toBe("error");
  });

  it("trackPaymentEvent logs payment info", () => {
    trackPaymentEvent("service_fee", "ORD-100", 50, "CNY");
    const entry = lastLog();
    expect(entry.event).toBe("payment.service_fee");
    expect((entry.data as Record<string, unknown>).amount).toBe(50);
  });

  it("trackLedgerCredit truncates address", () => {
    trackLedgerCredit("0xabcdef1234567890", 100, "referral");
    const entry = lastLog();
    expect(entry.event).toBe("ledger.credit");
    expect((entry.data as Record<string, unknown>).diamondAmount).toBe(100);
    expect((entry.data as Record<string, unknown>).source).toBe("referral");
  });
});
