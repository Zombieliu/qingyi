import { describe, it, expect } from "vitest";
import { classifyChainError, type ChainErrorInfo } from "../chain-error";

function expectInfo(error: unknown, expected: Partial<ChainErrorInfo>) {
  const info = classifyChainError(error);
  for (const [key, value] of Object.entries(expected)) {
    expect(info[key as keyof ChainErrorInfo]).toBe(value);
  }
}

describe("classifyChainError", () => {
  describe("gas insufficient", () => {
    it("matches InsufficientGas", () => {
      expectInfo(new Error("InsufficientGas: not enough balance"), {
        title: "Gas 不足",
        actionType: "topup",
        recoverable: true,
      });
    });
    it("matches insufficient gas (lowercase)", () => {
      expectInfo("insufficient gas for transaction", {
        title: "Gas 不足",
      });
    });
  });

  describe("sponsor failure", () => {
    it("matches 赞助交易失败", () => {
      expectInfo(new Error("赞助交易构建失败"), {
        title: "代付交易失败",
        actionType: "retry",
      });
    });
    it("matches 赞助交易 failed", () => {
      expectInfo(new Error("赞助交易 failed"), {
        title: "代付交易失败",
      });
    });
  });

  describe("rate limit", () => {
    it("matches 429", () => {
      expectInfo(new Error("HTTP 429"), {
        title: "请求过于频繁",
        actionType: "retry",
      });
    });
    it("matches too many requests", () => {
      expectInfo("too many requests", { title: "请求过于频繁" });
    });
    it("matches Too Many", () => {
      expectInfo(new Error("Too Many Requests"), { title: "请求过于频繁" });
    });
  });

  describe("timeout / network", () => {
    it("matches timeout", () => {
      expectInfo(new Error("request timeout"), {
        title: "网络超时",
        actionType: "retry",
      });
    });
    it("matches fetch failed", () => {
      expectInfo(new Error("fetch failed"), { title: "网络超时" });
    });
    it("matches Timeout (capitalized)", () => {
      expectInfo(new Error("Connection Timeout"), { title: "网络超时" });
    });
  });

  describe("passkey / auth", () => {
    it("matches 未找到 Passkey (specific, before generic)", () => {
      expectInfo(new Error("未找到 Passkey 钱包，请先登录"), {
        title: "未登录",
        actionType: "refresh",
      });
    });
    it("matches 请先登录", () => {
      expectInfo(new Error("请先登录"), {
        title: "未登录",
      });
    });
    it("matches generic passkey error", () => {
      expectInfo(new Error("Passkey 数据损坏"), {
        title: "身份验证失败",
        actionType: "retry",
      });
    });
    it("matches credential error", () => {
      expectInfo(new Error("credential not found"), {
        title: "身份验证失败",
      });
    });
  });

  describe("contract abort", () => {
    it("matches MoveAbort", () => {
      expectInfo(new Error("MoveAbort(0x1, 42)"), {
        title: "合约执行失败",
        actionType: "refresh",
      });
    });
    it("matches move_abort", () => {
      expectInfo(new Error("move_abort in module"), {
        title: "合约执行失败",
      });
    });
  });

  describe("config error", () => {
    it("matches 合约未部署", () => {
      expectInfo(new Error("合约未部署：缺少 PACKAGE_ID"), {
        title: "系统配置错误",
        recoverable: false,
        actionType: "contact",
      });
    });
    it("matches DAPP_HUB", () => {
      expectInfo(new Error("missing DAPP_HUB_ID"), {
        title: "系统配置错误",
        recoverable: false,
      });
    });
  });

  describe("fallback", () => {
    it("returns generic error for unknown messages", () => {
      const info = classifyChainError(new Error("something weird happened"));
      expect(info.title).toBe("操作失败");
      expect(info.recoverable).toBe(true);
      expect(info.actionType).toBe("retry");
      expect(info.message).toContain("something weird happened");
    });
    it("truncates long messages", () => {
      const longMsg = "x".repeat(200);
      const info = classifyChainError(new Error(longMsg));
      expect(info.message.length).toBeLessThan(110);
      expect(info.message).toContain("...");
    });
    it("handles non-Error values", () => {
      const info = classifyChainError("raw string error");
      expect(info.title).toBe("操作失败");
      expect(info.message).toContain("raw string error");
    });
    it("handles null/undefined", () => {
      expect(classifyChainError(null).title).toBe("操作失败");
      expect(classifyChainError(undefined).title).toBe("操作失败");
    });
  });
});
