import { getCacheAsync, isRedisCacheAvailable, setCacheAsync } from "@/lib/server-cache";

/**
 * Lightweight Circuit Breaker pattern implementation.
 *
 * States:
 *   CLOSED  - Normal operation, requests pass through
 *   OPEN    - Failures exceeded threshold, requests are rejected immediately
 *   HALF_OPEN - After reset timeout, one probe request is allowed through
 */

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

type CircuitSharedState = {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  updatedAt: number;
};

export type CircuitBreakerOptions = {
  /** Name for logging / identification */
  name: string;
  /** Number of consecutive failures before opening the circuit (default: 5) */
  failureThreshold?: number;
  /** Milliseconds to wait before transitioning from OPEN to HALF_OPEN (default: 30000) */
  resetTimeoutMs?: number;
  /** Optional callback when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState, name: string) => void;
  /**
   * Enable Redis-backed shared state for multi-instance deployments.
   * Defaults to true when Upstash Redis is configured.
   */
  enableSharedState?: boolean;
  /** Minimum sync interval for shared state pulls (default: 1000ms) */
  sharedSyncIntervalMs?: number;
};

export class CircuitBreaker {
  readonly name: string;
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private stateUpdatedAt = 0;
  private lastSyncAt = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly onStateChange?: CircuitBreakerOptions["onStateChange"];
  private readonly sharedStateEnabled: boolean;
  private readonly sharedSyncIntervalMs: number;
  private readonly sharedStateKey: string;
  private readonly sharedStateTtlMs: number;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
    this.onStateChange = options.onStateChange;
    this.sharedStateEnabled = options.enableSharedState ?? isRedisCacheAvailable();
    this.sharedSyncIntervalMs = Math.max(0, options.sharedSyncIntervalMs ?? 1000);
    this.sharedStateKey = `cb:${this.name}`;
    this.sharedStateTtlMs = Math.max(this.resetTimeoutMs * 4, 60_000);
  }

  getState(): CircuitState {
    // Auto-transition from OPEN -> HALF_OPEN when timeout has elapsed
    if (
      this.state === CircuitState.OPEN &&
      Date.now() - this.lastFailureTime >= this.resetTimeoutMs
    ) {
      this.transition(CircuitState.HALF_OPEN);
      void this.persistSharedState();
    }
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  /** Execute an async function through the circuit breaker */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.syncSharedState();
    const current = this.getState();

    if (current === CircuitState.OPEN) {
      throw new CircuitBreakerError(
        `Circuit breaker "${this.name}" is OPEN — request rejected`,
        this.name,
        CircuitState.OPEN
      );
    }

    try {
      const result = await fn();
      await this.onSuccess();
      return result;
    } catch (error) {
      await this.onFailure();
      throw error;
    }
  }

  /** Manually reset the circuit breaker to CLOSED */
  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.stateUpdatedAt = Date.now();
    if (this.state !== CircuitState.CLOSED) {
      this.transition(CircuitState.CLOSED);
    }
    void this.persistSharedState();
  }

  private async onSuccess(): Promise<void> {
    // Any success in HALF_OPEN means the service recovered
    if (this.state === CircuitState.HALF_OPEN) {
      this.failureCount = 0;
      this.transition(CircuitState.CLOSED);
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.stateUpdatedAt = Date.now();
    }
    await this.persistSharedState();
  }

  private async onFailure(): Promise<void> {
    this.failureCount += 1;
    this.lastFailureTime = Date.now();
    this.stateUpdatedAt = this.lastFailureTime;

    if (this.state === CircuitState.HALF_OPEN) {
      // Probe failed — go back to OPEN
      this.transition(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED && this.failureCount >= this.failureThreshold) {
      this.transition(CircuitState.OPEN);
    }

    await this.persistSharedState();
  }

  private transition(to: CircuitState): void {
    const from = this.state;
    this.state = to;
    this.stateUpdatedAt = Date.now();
    this.onStateChange?.(from, to, this.name);
  }

  private toSharedState(): CircuitSharedState {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      updatedAt: this.stateUpdatedAt,
    };
  }

  private applySharedState(next: CircuitSharedState): void {
    this.state = next.state;
    this.failureCount = next.failureCount;
    this.lastFailureTime = next.lastFailureTime;
    this.stateUpdatedAt = next.updatedAt;
  }

  private async syncSharedState(force = false): Promise<void> {
    if (!this.sharedStateEnabled) return;
    const now = Date.now();
    if (!force && now - this.lastSyncAt < this.sharedSyncIntervalMs) return;

    this.lastSyncAt = now;
    const entry = await getCacheAsync<CircuitSharedState>(this.sharedStateKey);
    const remote = entry?.value;
    if (!remote) return;

    if (!this.stateUpdatedAt || remote.updatedAt > this.stateUpdatedAt) {
      this.applySharedState(remote);
    }
  }

  private async persistSharedState(): Promise<void> {
    if (!this.sharedStateEnabled) return;
    const snapshot = this.toSharedState();
    await setCacheAsync(this.sharedStateKey, snapshot, this.sharedStateTtlMs);
  }
}

export class CircuitBreakerError extends Error {
  readonly circuitName: string;
  readonly circuitState: CircuitState;

  constructor(message: string, name: string, state: CircuitState) {
    super(message);
    this.circuitName = name;
    this.circuitState = state;
  }
}

// ---- Pre-configured instances ----

function defaultOnStateChange(from: CircuitState, to: CircuitState, name: string) {
  console.warn(`[CircuitBreaker] ${name}: ${from} -> ${to}`);
}

/** Circuit breaker for Stripe API calls */
export const stripeCircuit = new CircuitBreaker({
  name: "stripe",
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  onStateChange: defaultOnStateChange,
});

/** Circuit breaker for Kook webhook / API calls */
export const kookCircuit = new CircuitBreaker({
  name: "kook",
  failureThreshold: 3,
  resetTimeoutMs: 20_000,
  onStateChange: defaultOnStateChange,
});

/** Circuit breaker for on-chain RPC calls (Sui / Dubhe) */
export const chainRpcCircuit = new CircuitBreaker({
  name: "chain-rpc",
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  onStateChange: defaultOnStateChange,
});
