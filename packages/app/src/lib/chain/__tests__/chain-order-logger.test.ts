import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    CHAIN_ORDER_DEBUG: "1",
  },
}));

import { chainOrderLogger, logChainOrderOperation } from "../chain-order-logger";

beforeEach(() => {
  vi.clearAllMocks();
  chainOrderLogger.clearLogs();
});

describe("chainOrderLogger", () => {
  describe("log levels", () => {
    it("logs debug messages when enabled", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      chainOrderLogger.debug("test-op", { key: "value" });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it("logs info messages", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      chainOrderLogger.info("test-info", { data: 1 });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it("logs warn messages", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      chainOrderLogger.warn("test-warn", { warning: true });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it("logs error messages", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      chainOrderLogger.error("test-error", new Error("test"), { extra: "data" });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it("logs error with string error", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      chainOrderLogger.error("test-error", "string error");
      const logs = chainOrderLogger.getLogs({ level: "error" });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].error).toBe("string error");
      spy.mockRestore();
    });
  });

  describe("getLogs", () => {
    it("returns all logs without filter", () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      chainOrderLogger.info("op1");
      chainOrderLogger.warn("op2");
      const logs = chainOrderLogger.getLogs();
      expect(logs.length).toBe(2);
      vi.restoreAllMocks();
    });

    it("filters by level", () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      chainOrderLogger.info("op1");
      chainOrderLogger.warn("op2");
      const logs = chainOrderLogger.getLogs({ level: "warn" });
      expect(logs.length).toBe(1);
      expect(logs[0].operation).toBe("op2");
      vi.restoreAllMocks();
    });

    it("filters by operation", () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      chainOrderLogger.info("fetchOrders");
      chainOrderLogger.info("syncOrders");
      const logs = chainOrderLogger.getLogs({ operation: "fetch" });
      expect(logs.length).toBe(1);
      vi.restoreAllMocks();
    });

    it("limits results", () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      chainOrderLogger.info("op1");
      chainOrderLogger.info("op2");
      chainOrderLogger.info("op3");
      const logs = chainOrderLogger.getLogs({ limit: 2 });
      expect(logs.length).toBe(2);
      vi.restoreAllMocks();
    });
  });

  describe("clearLogs", () => {
    it("clears all logs", () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      chainOrderLogger.info("op1");
      chainOrderLogger.clearLogs();
      expect(chainOrderLogger.getLogs().length).toBe(0);
      vi.restoreAllMocks();
    });
  });

  describe("log overflow", () => {
    it("trims logs when exceeding maxLogs (1000)", () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      // Fill up to 1001 logs to trigger shift
      for (let i = 0; i < 1001; i++) {
        chainOrderLogger.info(`op-${i}`);
      }
      const logs = chainOrderLogger.getLogs();
      expect(logs.length).toBe(1000);
      // First log should be op-1 (op-0 was shifted out)
      expect(logs[0].operation).toBe("op-1");
      vi.restoreAllMocks();
    });
  });

  describe("trackPerformance", () => {
    it("tracks successful operation", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const result = await chainOrderLogger.trackPerformance("test-op", "order-1", async () => {
        return "success";
      });
      expect(result).toBe("success");
      const logs = chainOrderLogger.getLogs({ operation: "test-op" });
      expect(logs.length).toBe(2); // started + completed
      vi.restoreAllMocks();
    });

    it("tracks failed operation and rethrows", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(
        chainOrderLogger.trackPerformance("fail-op", "order-2", async () => {
          throw new Error("boom");
        })
      ).rejects.toThrow("boom");
      const logs = chainOrderLogger.getLogs({ level: "error" });
      expect(logs.length).toBeGreaterThan(0);
      vi.restoreAllMocks();
    });
  });
});

describe("logChainOrderOperation", () => {
  it("wraps a function with performance tracking", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fn = async (orderId: string) => `done-${orderId}`;
    const wrapped = logChainOrderOperation(
      "wrapped-op",
      fn as (...args: unknown[]) => Promise<unknown>
    );
    const result = await wrapped("123");
    expect(result).toBe("done-123");
    vi.restoreAllMocks();
  });

  it("passes undefined orderId when first arg is not a string", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fn = async (num: unknown) => `done-${num}`;
    const wrapped = logChainOrderOperation(
      "wrapped-op-num",
      fn as unknown as (...args: unknown[]) => Promise<unknown>
    );
    const result = await wrapped(42);
    expect(result).toBe("done-42");
    vi.restoreAllMocks();
  });
});

describe("chainOrderLogger disabled mode", () => {
  it("skips non-error logs when disabled", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({
      env: { CHAIN_ORDER_DEBUG: "0" },
    }));
    const { chainOrderLogger: disabledLogger } = await import("../chain-order-logger");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    disabledLogger.debug("test-debug");
    disabledLogger.info("test-info");
    // Non-error logs should be skipped
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("still logs error messages when disabled", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({
      env: { CHAIN_ORDER_DEBUG: "0" },
    }));
    const { chainOrderLogger: disabledLogger } = await import("../chain-order-logger");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    disabledLogger.error("test-error", new Error("test"));
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
