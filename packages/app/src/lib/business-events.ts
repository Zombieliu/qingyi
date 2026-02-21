import "server-only";

/**
 * 结构化业务事件日志
 *
 * 关键业务事件统一记录，方便监控和告警。
 * 生产环境通过 Sentry breadcrumbs 上报，同时输出结构化 JSON 日志。
 */

type EventSeverity = "info" | "warning" | "error" | "critical";

type BusinessEvent = {
  event: string;
  severity: EventSeverity;
  data?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
};

function emit(evt: BusinessEvent) {
  const entry = {
    ...evt,
    timestamp: new Date().toISOString(),
    service: "qingyi-app",
  };

  // 结构化 JSON 日志（Vercel 日志可搜索）
  if (evt.severity === "error" || evt.severity === "critical") {
    console.error(JSON.stringify(entry));
  } else if (evt.severity === "warning") {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }

  // Sentry breadcrumb（如果可用）
  try {
    import("@sentry/nextjs")
      .then((Sentry) => {
        if (Sentry?.addBreadcrumb) {
          Sentry.addBreadcrumb({
            category: "business",
            message: evt.event,
            level: evt.severity === "critical" ? "fatal" : evt.severity,
            data: evt.data,
          });
        }
        if (evt.severity === "critical" && Sentry?.captureMessage) {
          Sentry.captureMessage(`[CRITICAL] ${evt.event}`, {
            level: "fatal",
            extra: evt.data,
          });
        }
      })
      .catch(() => {});
  } catch {
    // Sentry not available, that's fine
  }
}

// --- 具体业务事件 ---

export function trackOrderCreated(orderId: string, source: string, amount: number) {
  emit({
    event: "order.created",
    severity: "info",
    data: { orderId, source, amount },
  });
}

export function trackOrderCompleted(orderId: string, durationMs?: number) {
  emit({
    event: "order.completed",
    severity: "info",
    data: { orderId, durationMs },
  });
}

export function trackChainSyncResult(result: {
  total: number;
  created: number;
  updated: number;
  mode: string;
  durationMs: number;
}) {
  emit({
    event: "chain.sync.completed",
    severity: "info",
    data: result,
  });
}

export function trackChainSyncFailed(error: string) {
  emit({
    event: "chain.sync.failed",
    severity: "error",
    data: { error },
  });
}

export function trackWebhookFailed(orderId: string, error: string) {
  emit({
    event: "webhook.failed",
    severity: "warning",
    data: { orderId, error },
  });
}

export function trackSponsorGasLow(balance: string, threshold: string) {
  emit({
    event: "sponsor.gas.low",
    severity: "critical",
    data: { balance, threshold },
  });
}

export function trackAuthSessionCreated(address: string) {
  emit({
    event: "auth.session.created",
    severity: "info",
    data: { address: address.slice(0, 10) + "..." },
  });
}

export function trackAuthFailed(reason: string, ip?: string) {
  emit({
    event: "auth.failed",
    severity: "warning",
    data: { reason, ip },
  });
}

export function trackCronCompleted(
  job: string,
  result: Record<string, unknown>,
  durationMs: number
) {
  emit({
    event: `cron.${job}.completed`,
    severity: "info",
    data: { ...result, durationMs },
  });
}

export function trackCronFailed(job: string, error: string) {
  emit({
    event: `cron.${job}.failed`,
    severity: "error",
    data: { error },
  });
}

export function trackPaymentEvent(type: string, orderId: string, amount: number, currency: string) {
  emit({
    event: `payment.${type}`,
    severity: "info",
    data: { orderId, amount, currency },
  });
}

export function trackLedgerCredit(userAddress: string, diamondAmount: number, source: string) {
  emit({
    event: "ledger.credit",
    severity: "info",
    data: { userAddress: userAddress.slice(0, 10) + "...", diamondAmount, source },
  });
}
