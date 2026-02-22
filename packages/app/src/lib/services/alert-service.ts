import "server-only";

/**
 * Monitoring alert service.
 * Sends alerts when metrics exceed thresholds.
 * Channels: console (always), Kook (if configured), Sentry (if configured).
 */

type AlertLevel = "warning" | "critical";

type Alert = {
  level: AlertLevel;
  title: string;
  message: string;
  metric?: string;
  value?: number;
  threshold?: number;
};

// Web Vitals thresholds (poor ratings per Google)
const VITALS_THRESHOLDS: Record<string, { warning: number; critical: number; unit: string }> = {
  LCP: { warning: 2500, critical: 4000, unit: "ms" },
  FID: { warning: 100, critical: 300, unit: "ms" },
  CLS: { warning: 0.1, critical: 0.25, unit: "" },
  FCP: { warning: 1800, critical: 3000, unit: "ms" },
  TTFB: { warning: 800, critical: 1800, unit: "ms" },
  INP: { warning: 200, critical: 500, unit: "ms" },
};

/** Check a Web Vital metric and alert if threshold exceeded */
export function checkVitalAlert(name: string, value: number, page: string): Alert | null {
  const threshold = VITALS_THRESHOLDS[name];
  if (!threshold) return null;

  if (value >= threshold.critical) {
    return {
      level: "critical",
      title: `🚨 ${name} Critical`,
      message: `${name}=${value}${threshold.unit} on ${page} (threshold: ${threshold.critical}${threshold.unit})`,
      metric: name,
      value,
      threshold: threshold.critical,
    };
  }

  if (value >= threshold.warning) {
    return {
      level: "warning",
      title: `⚠️ ${name} Warning`,
      message: `${name}=${value}${threshold.unit} on ${page} (threshold: ${threshold.warning}${threshold.unit})`,
      metric: name,
      value,
      threshold: threshold.warning,
    };
  }

  return null;
}

/** Check reconciliation results and alert on anomalies */
export function checkReconcileAlert(mismatched: number, total: number): Alert | null {
  if (mismatched === 0) return null;

  const ratio = total > 0 ? mismatched / total : 0;

  if (ratio > 0.1 || mismatched > 10) {
    return {
      level: "critical",
      title: "🚨 Reconciliation Alert",
      message: `${mismatched}/${total} orders mismatched (${(ratio * 100).toFixed(1)}%)`,
      metric: "reconcile_mismatch",
      value: mismatched,
      threshold: 10,
    };
  }

  if (mismatched > 0) {
    return {
      level: "warning",
      title: "⚠️ Reconciliation Warning",
      message: `${mismatched}/${total} orders mismatched`,
      metric: "reconcile_mismatch",
      value: mismatched,
    };
  }

  return null;
}

/** Send alert to all configured channels */
export async function sendAlert(alert: Alert): Promise<void> {
  // Always log
  const logFn = alert.level === "critical" ? console.error : console.warn;
  logFn(JSON.stringify({ type: "alert", ...alert, timestamp: Date.now() }));

  // Sentry (if available)
  try {
    const Sentry = await import("@sentry/nextjs");
    if (alert.level === "critical") {
      Sentry.captureMessage(alert.message, "error");
    } else {
      Sentry.captureMessage(alert.message, "warning");
    }
  } catch {
    /* Sentry not configured */
  }

  // Kook (if configured)
  try {
    const { isKookEnabled, sendChannelMessage } = await import("@/lib/services/kook-service");
    if (isKookEnabled()) {
      const emoji = alert.level === "critical" ? "🚨" : "⚠️";
      await sendChannelMessage({
        content: `**${emoji} ${alert.title}**\n> ${alert.message}`,
      });
    }
  } catch {
    /* Kook not configured */
  }
}

/** Convenience: check vital and send alert if needed */
export async function alertOnVital(name: string, value: number, page: string): Promise<void> {
  const alert = checkVitalAlert(name, value, page);
  if (alert) await sendAlert(alert);
}

/** Convenience: check reconcile and send alert if needed */
export async function alertOnReconcile(mismatched: number, total: number): Promise<void> {
  const alert = checkReconcileAlert(mismatched, total);
  if (alert) await sendAlert(alert);
}
