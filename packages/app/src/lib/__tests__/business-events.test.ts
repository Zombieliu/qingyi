import { describe, it, expect, vi, beforeEach } from "vitest";

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

let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

function lastFromSpy(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const calls = spy.mock.calls;
  return JSON.parse(calls[calls.length - 1]?.[0] as string);
}

describe("business-events", () => {
  it("trackOrderCreated emits info log", () => {
    trackOrderCreated("ORD-1", "chain", 99.5);
    expect(logSpy).toHaveBeenCalled();
    const entry = lastFromSpy(logSpy);
    expect(entry.event).toBe("order.created");
    expect(entry.severity).toBe("info");
    expect(entry.service).toBe("qingyi-app");
    expect(entry.timestamp).toBeDefined();
    expect((entry.data as Record<string, unknown>).orderId).toBe("ORD-1");
    expect((entry.data as Record<string, unknown>).source).toBe("chain");
    expect((entry.data as Record<string, unknown>).amount).toBe(99.5);
  });

  it("trackOrderCompleted includes durationMs", () => {
    trackOrderCompleted("ORD-2", 5000);
    const entry = lastFromSpy(logSpy);
    expect(entry.event).toBe("order.completed");
    expect((entry.data as Record<string, unknown>).durationMs).toBe(5000);
  });

  it("trackChainSyncResult logs sync stats as info", () => {
    trackChainSyncResult({
      total: 10,
      created: 3,
      updated: 7,
      mode: "incremental",
      durationMs: 1200,
    });
    const entry = lastFromSpy(logSpy);
    expect(entry.event).toBe("chain.sync.completed");
    expect((entry.data as Record<string, unknown>).total).toBe(10);
    expect((entry.data as Record<string, unknown>).mode).toBe("incremental");
  });

  it("trackChainSyncFailed uses console.error", () => {
    trackChainSyncFailed("connection refused");
    expect(errorSpy).toHaveBeenCalled();
    const entry = lastFromSpy(errorSpy);
    expect(entry.severity).toBe("error");
    expect(entry.event).toBe("chain.sync.failed");
  });

  it("trackWebhookFailed uses console.warn", () => {
    trackWebhookFailed("ORD-3", "HTTP 500");
    expect(warnSpy).toHaveBeenCalled();
    const entry = lastFromSpy(warnSpy);
    expect(entry.severity).toBe("warning");
    expect(entry.event).toBe("webhook.failed");
  });

  it("trackSponsorGasLow uses console.error (critical)", () => {
    trackSponsorGasLow("0.001", "0.1");
    expect(errorSpy).toHaveBeenCalled();
    const entry = lastFromSpy(errorSpy);
    expect(entry.severity).toBe("critical");
    expect(entry.event).toBe("sponsor.gas.low");
  });

  it("trackAuthSessionCreated truncates address", () => {
    trackAuthSessionCreated("0x1234567890abcdef1234567890abcdef");
    const entry = lastFromSpy(logSpy);
    expect(entry.event).toBe("auth.session.created");
    expect((entry.data as Record<string, unknown>).address).toBe("0x12345678...");
  });

  it("trackAuthFailed includes reason and ip", () => {
    trackAuthFailed("expired_nonce", "1.2.3.4");
    const entry = lastFromSpy(warnSpy);
    expect(entry.event).toBe("auth.failed");
    expect((entry.data as Record<string, unknown>).reason).toBe("expired_nonce");
    expect((entry.data as Record<string, unknown>).ip).toBe("1.2.3.4");
  });

  it("trackCronCompleted includes job name in event", () => {
    trackCronCompleted("chain-sync", { synced: 5 }, 800);
    const entry = lastFromSpy(logSpy);
    expect(entry.event).toBe("cron.chain-sync.completed");
    expect((entry.data as Record<string, unknown>).durationMs).toBe(800);
  });

  it("trackCronFailed uses error severity", () => {
    trackCronFailed("maintenance", "db timeout");
    const entry = lastFromSpy(errorSpy);
    expect(entry.event).toBe("cron.maintenance.failed");
    expect(entry.severity).toBe("error");
  });

  it("trackPaymentEvent includes type in event", () => {
    trackPaymentEvent("refund", "ORD-4", 50, "CNY");
    const entry = lastFromSpy(logSpy);
    expect(entry.event).toBe("payment.refund");
    expect((entry.data as Record<string, unknown>).currency).toBe("CNY");
  });

  it("trackLedgerCredit truncates address", () => {
    trackLedgerCredit("0xabcdef1234567890", 100, "referral");
    const entry = lastFromSpy(logSpy);
    expect(entry.event).toBe("ledger.credit");
    expect((entry.data as Record<string, unknown>).diamondAmount).toBe(100);
    expect(((entry.data as Record<string, unknown>).userAddress as string).endsWith("...")).toBe(
      true
    );
  });
});
