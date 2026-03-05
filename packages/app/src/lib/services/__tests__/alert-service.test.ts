import { describe, it, expect, vi, beforeEach } from "vitest";

const mockIsKookEnabled = vi.fn();
const mockSendChannelMessage = vi.fn();
const mockCaptureMessage = vi.fn();

vi.mock("@/lib/services/kook-service", () => ({
  isKookEnabled: (...args: unknown[]) => mockIsKookEnabled(...args),
  sendChannelMessage: (...args: unknown[]) => mockSendChannelMessage(...args),
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
}));

import {
  checkVitalAlert,
  checkReconcileAlert,
  sendAlert,
  alertOnVital,
  alertOnReconcile,
  alertOnEdgeRuntimeIncompatibleDb,
  __resetAlertServiceForTests,
} from "@/lib/services/alert-service";

beforeEach(() => {
  vi.clearAllMocks();
  __resetAlertServiceForTests();
});

describe("checkVitalAlert", () => {
  it("returns null for unknown metric name", () => {
    const result = checkVitalAlert("UNKNOWN", 9999, "/home");
    expect(result).toBeNull();
  });

  it("returns null when value is below warning threshold", () => {
    const result = checkVitalAlert("LCP", 1000, "/home");
    expect(result).toBeNull();
  });

  it("returns warning when value exceeds warning but not critical", () => {
    const result = checkVitalAlert("LCP", 3000, "/home");
    expect(result).not.toBeNull();
    expect(result!.level).toBe("warning");
    expect(result!.metric).toBe("LCP");
    expect(result!.value).toBe(3000);
    expect(result!.threshold).toBe(2500);
  });

  it("returns critical when value exceeds critical threshold", () => {
    const result = checkVitalAlert("LCP", 5000, "/home");
    expect(result).not.toBeNull();
    expect(result!.level).toBe("critical");
    expect(result!.threshold).toBe(4000);
  });

  it("handles CLS metric with decimal thresholds", () => {
    const result = checkVitalAlert("CLS", 0.15, "/page");
    expect(result).not.toBeNull();
    expect(result!.level).toBe("warning");

    const critical = checkVitalAlert("CLS", 0.3, "/page");
    expect(critical).not.toBeNull();
    expect(critical!.level).toBe("critical");
  });
});

describe("checkReconcileAlert", () => {
  it("returns null when mismatched is 0", () => {
    const result = checkReconcileAlert(0, 100);
    expect(result).toBeNull();
  });

  it("returns warning for small number of mismatches", () => {
    const result = checkReconcileAlert(3, 100);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("warning");
    expect(result!.metric).toBe("reconcile_mismatch");
  });

  it("returns critical when mismatched > 10", () => {
    const result = checkReconcileAlert(15, 100);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("critical");
  });

  it("returns critical when ratio > 10%", () => {
    const result = checkReconcileAlert(6, 50);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("critical");
  });

  it("handles total of 0 with non-zero mismatched", () => {
    // ratio = 0 when total is 0, but mismatched > 0 triggers warning
    const result = checkReconcileAlert(5, 0);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("warning");
  });

  it("returns null for negative mismatched (edge case)", () => {
    const result = checkReconcileAlert(-1, 100);
    expect(result).toBeNull();
  });
});

describe("sendAlert", () => {
  it("logs critical alerts with console.error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockIsKookEnabled.mockReturnValue(false);

    await sendAlert({
      level: "critical",
      title: "Test Critical",
      message: "Something broke",
    });

    expect(spy).toHaveBeenCalled();
    expect(mockCaptureMessage).toHaveBeenCalledWith("Something broke", "error");
    spy.mockRestore();
  });

  it("logs warning alerts with console.warn", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockIsKookEnabled.mockReturnValue(false);

    await sendAlert({
      level: "warning",
      title: "Test Warning",
      message: "Something slow",
    });

    expect(spy).toHaveBeenCalled();
    expect(mockCaptureMessage).toHaveBeenCalledWith("Something slow", "warning");
    spy.mockRestore();
  });

  it("sends to Kook when enabled", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockIsKookEnabled.mockReturnValue(true);
    mockSendChannelMessage.mockResolvedValue({ ok: true });

    await sendAlert({
      level: "warning",
      title: "Test",
      message: "msg",
    });

    expect(mockSendChannelMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Test") })
    );
    vi.restoreAllMocks();
  });
});

describe("alertOnVital", () => {
  it("sends alert when vital exceeds threshold", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockIsKookEnabled.mockReturnValue(false);

    await alertOnVital("LCP", 5000, "/home");

    expect(mockCaptureMessage).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("does nothing when vital is within threshold", async () => {
    await alertOnVital("LCP", 500, "/home");
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });
});

describe("alertOnReconcile", () => {
  it("sends alert when mismatches exist", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockIsKookEnabled.mockReturnValue(false);

    await alertOnReconcile(5, 100);

    expect(mockCaptureMessage).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("does nothing when no mismatches", async () => {
    await alertOnReconcile(0, 100);
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });
});

describe("alertOnEdgeRuntimeIncompatibleDb", () => {
  it("sends warning alert for edge-incompatible 503", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockIsKookEnabled.mockReturnValue(false);

    await alertOnEdgeRuntimeIncompatibleDb({
      path: "/api/admin/reconcile",
      method: "GET",
      role: "finance",
      runtime: "worker",
    });

    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining("edge_runtime_incompatible_db"),
      "warning"
    );
    vi.restoreAllMocks();
  });

  it("throttles duplicate alerts for the same method+path in cooldown window", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockIsKookEnabled.mockReturnValue(false);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-05T00:00:00.000Z"));

    await alertOnEdgeRuntimeIncompatibleDb({
      path: "/api/admin/reconcile",
      method: "POST",
      role: "admin",
      runtime: "worker",
    });
    await alertOnEdgeRuntimeIncompatibleDb({
      path: "/api/admin/reconcile",
      method: "POST",
      role: "admin",
      runtime: "worker",
    });

    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not throttle different endpoints", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockIsKookEnabled.mockReturnValue(false);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-05T00:10:00.000Z"));

    await alertOnEdgeRuntimeIncompatibleDb({
      path: "/api/admin/reconcile",
      method: "GET",
    });
    await alertOnEdgeRuntimeIncompatibleDb({
      path: "/api/players",
      method: "GET",
    });

    expect(mockCaptureMessage).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
});
