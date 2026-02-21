/**
 * 链上订单操作日志工具
 *
 * 用于记录和调试链上订单相关操作
 */

import { env } from "@/lib/env";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogData = Record<string, unknown>;

type LogEntry = {
  timestamp: string;
  level: LogLevel;
  operation: string;
  orderId?: string;
  duration?: number;
  error?: string;
  stack?: string;
  [key: string]: unknown;
};

class ChainOrderLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private enabled = env.CHAIN_ORDER_DEBUG === "1";

  log(level: LogLevel, operation: string, data: LogData = {}) {
    if (!this.enabled && level !== "error") return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      operation,
      ...data,
    };

    this.logs.push(entry);

    // 保持日志数量在限制内
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // 输出到控制台
    const prefix = `[ChainOrder:${level.toUpperCase()}]`;
    const message = `${prefix} ${operation}`;

    if (level === "error") {
      console.error(message, data);
    } else if (level === "warn") {
      console.warn(message, data);
    } else {
      console.log(message, data);
    }
  }

  debug(operation: string, data?: LogData) {
    this.log("debug", operation, data);
  }

  info(operation: string, data?: LogData) {
    this.log("info", operation, data);
  }

  warn(operation: string, data?: LogData) {
    this.log("warn", operation, data);
  }

  error(operation: string, error: unknown, data: LogData = {}) {
    this.log("error", operation, {
      ...data,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  getLogs(filter?: { level?: LogLevel; operation?: string; limit?: number }): LogEntry[] {
    let filtered = this.logs;

    if (filter?.level) {
      filtered = filtered.filter((log) => log.level === filter.level);
    }

    if (filter?.operation) {
      filtered = filtered.filter((log) => log.operation.includes(filter.operation!));
    }

    if (filter?.limit) {
      filtered = filtered.slice(-filter.limit);
    }

    return filtered;
  }

  clearLogs() {
    this.logs = [];
  }

  /**
   * 性能跟踪辅助函数
   */
  async trackPerformance<T>(
    operation: string,
    orderId: string | undefined,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now();
    this.debug(operation, { orderId, status: "started" });

    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.info(operation, { orderId, status: "completed", duration });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.error(operation, error, { orderId, duration });
      throw error;
    }
  }
}

// 全局单例
export const chainOrderLogger = new ChainOrderLogger();

/**
 * 性能监控装饰器（用于函数）
 */
export function logChainOrderOperation<T extends (...args: unknown[]) => Promise<unknown>>(
  operation: string,
  fn: T
): T {
  return (async (...args: Parameters<T>) => {
    const orderId = typeof args[0] === "string" ? args[0] : undefined;
    return chainOrderLogger.trackPerformance(operation, orderId, () => fn(...args));
  }) as T;
}
