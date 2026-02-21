import { describe, it, expect } from "vitest";
import { classifyChainError, type ChainErrorInfo } from "../chain-error";

function expectMatch(error: unknown, expected: Partial<ChainErrorInfo>) {
  const result = classifyChainError(error);
  for (const [key, value] of Object.entries(expected)) {
    expect(result[key as keyof ChainErrorInfo]).toBe(value);
  }
}

describe("classifyChainError", () => {
  describe("gas insufficient", () => {
    it("matches InsufficientGas", () => {
      expectMatch(new Error("InsufficientGas: not enough balance"), {
        title: "Gas 不足",
        actionType: "topup",
        recoverable: true,
      });
    });
    it("matches lowercase insufficient gas", () => {
      expectMatch("insufficient gas for transaction", {
        title: "Gas 不足",
      });
    });
  });

  describe("sponsor failure", () => {
    it("matches 赞助交易失败", () => {
      expectMatch(new Error("赞助交易构建失败"), {
        title: "代付交易失败",
        actionType: "retry",
      });
    });
    it("matches 赞助交易 failed", () => {
      expectMatch("赞助交易 failed", { title: "代付交易失败" });
    });
  });

  describe("rate limit", () => {
    it("matches 429", () => {
      expectMatch(new Error("HTTP 429"), { title: "请求过于频繁", actionType: "retry" });
    });
    it("matches too many requests", () => {
      expectMatch("too many requests", { title: "请求过于频繁" });
    });
    it("matches Too Many", () => {
      expectMatch("Too Many Requests", { title: "请求过于频繁" });
    });
  });

  describe("timeout / network", () => {
    it("matches timeout", () => {
      expectMatch(new Error("Request timeout"), { title: "网络超时", recoverable: true });
    });
    it("matches fetch failed", () => {
      expectMatch("fetch failed", { title: "网络超时" });
    });
  });

  describe("passkey auth", () => {
    it("matches Passkey error", () => {
      expectMatch(new Error("Passkey verification failed"), {
        title: "身份验证失败",
        actionType: "retry",
      });
    });
    it("matches credential error", () => {
      expectMatch("credential not found", { title: "身份验证失败" });
    });
  });

  describe("not logged in", () => {
    it("matches 未找到 Passkey", () => {
      expectMatch(new Error("未找到 Passkey 钱包，请先登录"), {
        title: "未登录",
        actionType: "refresh",
      });
    });
    it("matches 请先登录", () => {
      expectMatch("请先登录", { title: "未登录" });
    });
  });

  describe("contract abort", () => {
    it("matches MoveAbort", () => {
      expectMatch(new Error("MoveAbort(0x1, 42)"), {
        title: "合约执行失败",
        actionType: "refresh",
      });
    });
  });

  describe("config error", () => {
    it("matches 合约未部署", () => {
      expectMatch(new Error("合约未部署：缺少 PACKAGE_ID"), {
        title: "系统配置错误",
        recoverable: false,
        actionType: "contact",
      });
    });
    it("matches DAPP_HUB", () => {
      expectMatch("missing DAPP_HUB_ID", { title: "系统配置错误", recoverable: false });
    });
  });

  describe("fallback", () => {
    it("returns generic error for unknown messages", () => {
      const result = classifyChainError(new Error("something weird happened"));
      expect(result.title).toBe("操作失败");
      expect(result.recoverable).toBe(true);
      expect(result.actionType).toBe("retry");
      expect(result.message).toContain("something weird happened");
    });

    it("truncates long messages", () => {
      const longMsg = "x".repeat(200);
      const result = classifyChainError(new Error(longMsg));
      expect(result.message.length).toBeLessThan(110);
      expect(result.message).toContain("...");
    });

    it("handles non-Error input", () => {
      const result = classifyChainError(42);
      expect(result.title).toBe("操作失败");
      expect(result.message).toContain("42");
    });

    it("handles null/undefined", () => {
      expect(classifyChainError(null).title).toBe("操作失败");
      expect(classifyChainError(undefined).title).toBe("操作失败");
    });
  });
});
