"use client";

/**
 * 链上交易错误分类和用户友好提示
 *
 * 将底层错误信息转换为用户可理解的提示 + 恢复建议
 */

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
      title: "Gas 不足",
      message: "链上交易需要少量 SUI 作为手续费，你的钱包余额不足。",
      recoverable: true,
      action: "充值 SUI",
      actionType: "topup",
    },
  },
  {
    test: (m) => m.includes("赞助交易") && (m.includes("失败") || m.includes("failed")),
    info: {
      title: "代付交易失败",
      message:
        "平台代付通道暂时不可用，请稍后重试。如果持续失败，可以尝试用自己的 SUI 支付手续费。",
      recoverable: true,
      action: "重试",
      actionType: "retry",
    },
  },
  {
    test: (m) => m.includes("429") || m.includes("too many requests") || m.includes("Too Many"),
    info: {
      title: "请求过于频繁",
      message: "链上节点繁忙，请等几秒再试。",
      recoverable: true,
      action: "稍后重试",
      actionType: "retry",
    },
  },
  {
    test: (m) => m.includes("timeout") || m.includes("Timeout") || m.includes("fetch failed"),
    info: {
      title: "网络超时",
      message: "连接链上节点超时，可能是网络不稳定。请检查网络后重试。",
      recoverable: true,
      action: "重试",
      actionType: "retry",
    },
  },
  {
    test: (m) => m.includes("Passkey") || m.includes("passkey") || m.includes("credential"),
    info: {
      title: "身份验证失败",
      message: "指纹/面容验证未通过或被取消。请重新尝试验证。",
      recoverable: true,
      action: "重新验证",
      actionType: "retry",
    },
  },
  {
    test: (m) => m.includes("未找到 Passkey") || m.includes("请先登录"),
    info: {
      title: "未登录",
      message: "请先登录或创建账号。",
      recoverable: true,
      action: "去登录",
      actionType: "refresh",
    },
  },
  {
    test: (m) => m.includes("MoveAbort") || m.includes("move_abort"),
    info: {
      title: "合约执行失败",
      message: "链上合约拒绝了这笔操作，可能是订单状态已变更。请刷新页面查看最新状态。",
      recoverable: true,
      action: "刷新",
      actionType: "refresh",
    },
  },
  {
    test: (m) => m.includes("合约未部署") || m.includes("PACKAGE_ID") || m.includes("DAPP_HUB"),
    info: {
      title: "系统配置错误",
      message: "链上合约未正确配置，请联系客服。",
      recoverable: false,
      action: "联系客服",
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
    title: "操作失败",
    message: `${msg.slice(0, 100)}${msg.length > 100 ? "..." : ""}`,
    recoverable: true,
    action: "重试",
    actionType: "retry",
  };
}
