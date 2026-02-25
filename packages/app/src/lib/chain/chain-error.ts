"use client";

/**
 * 链上交易错误分类和用户友好提示
 *
 * 将底层错误信息转换为用户可理解的提示 + 恢复建议
 */

import { ChainMessages } from "@/lib/shared/messages";

export type ChainErrorInfo = {
  title: string;
  message: string;
  recoverable: boolean;
  action?: string; // 建议的操作按钮文案
  actionType?: "retry" | "topup" | "refresh" | "contact";
};

const ERROR_PATTERNS: Array<{
  test: (msg: string) => boolean;
  info: ChainErrorInfo;
}> = [
  {
    test: (m) => m.includes("InsufficientGas") || m.includes("insufficient gas"),
    info: {
      title: ChainMessages.ERROR_GAS_TITLE,
      message: ChainMessages.ERROR_GAS_MSG,
      recoverable: true,
      action: ChainMessages.ERROR_GAS_ACTION,
      actionType: "topup",
    },
  },
  {
    test: (m) =>
      m.includes(ChainMessages.SPONSOR_BUILD_FAILED) ||
      m.includes(ChainMessages.SPONSOR_EXEC_FAILED) ||
      (m.includes("赞助交易") && (m.includes("失败") || m.includes("failed"))),
    info: {
      title: ChainMessages.ERROR_SPONSOR_TITLE,
      message: ChainMessages.ERROR_SPONSOR_MSG,
      recoverable: true,
      action: ChainMessages.ERROR_RETRY,
      actionType: "retry",
    },
  },
  {
    test: (m) => m.includes("429") || m.includes("too many requests") || m.includes("Too Many"),
    info: {
      title: ChainMessages.ERROR_RATE_LIMIT_TITLE,
      message: ChainMessages.ERROR_RATE_LIMIT_MSG,
      recoverable: true,
      action: ChainMessages.ERROR_RATE_LIMIT_ACTION,
      actionType: "retry",
    },
  },
  {
    test: (m) => m.includes("timeout") || m.includes("Timeout") || m.includes("fetch failed"),
    info: {
      title: ChainMessages.ERROR_TIMEOUT_TITLE,
      message: ChainMessages.ERROR_TIMEOUT_MSG,
      recoverable: true,
      action: ChainMessages.ERROR_RETRY,
      actionType: "retry",
    },
  },
  {
    test: (m) =>
      m.includes(ChainMessages.PASSKEY_NOT_FOUND) ||
      m.includes(ChainMessages.LOGIN_REQUIRED_KEYWORD),
    info: {
      title: ChainMessages.ERROR_NOT_LOGGED_IN_TITLE,
      message: ChainMessages.ERROR_NOT_LOGGED_IN_MSG,
      recoverable: true,
      action: ChainMessages.ERROR_NOT_LOGGED_IN_ACTION,
      actionType: "refresh",
    },
  },
  {
    test: (m) => m.includes("Passkey") || m.includes("passkey") || m.includes("credential"),
    info: {
      title: ChainMessages.ERROR_AUTH_TITLE,
      message: ChainMessages.ERROR_AUTH_MSG,
      recoverable: true,
      action: ChainMessages.ERROR_AUTH_ACTION,
      actionType: "retry",
    },
  },
  {
    test: (m) => m.includes("MoveAbort") || m.includes("move_abort"),
    info: {
      title: ChainMessages.ERROR_CONTRACT_TITLE,
      message: ChainMessages.ERROR_CONTRACT_MSG,
      recoverable: true,
      action: ChainMessages.ERROR_REFRESH,
      actionType: "refresh",
    },
  },
  {
    test: (m) =>
      m.includes(ChainMessages.CONTRACT_MISSING_PACKAGE) ||
      m.includes("PACKAGE_ID") ||
      m.includes("DAPP_HUB"),
    info: {
      title: ChainMessages.ERROR_CONFIG_TITLE,
      message: ChainMessages.ERROR_CONFIG_MSG,
      recoverable: false,
      action: ChainMessages.ERROR_CONFIG_ACTION,
      actionType: "contact",
    },
  },
];

/**
 * 将原始错误转换为用户友好的错误信息
 */
export function classifyChainError(error: unknown): ChainErrorInfo {
  const msg = error instanceof Error ? error.message : String(error);

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(msg)) {
      return pattern.info;
    }
  }

  // 默认：未知错误
  return {
    title: ChainMessages.ERROR_DEFAULT_TITLE,
    message: `${msg.slice(0, 100)}${msg.length > 100 ? "..." : ""}`,
    recoverable: true,
    action: ChainMessages.ERROR_RETRY,
    actionType: "retry",
  };
}
