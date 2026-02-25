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

export type CircuitBreakerOptions = {
  /** Name for logging / identification */
  name: string;
  /** Number of consecutive failures before opening the circuit (default: 5) */
  failureThreshold?: number;
  /** Milliseconds to wait before transitioning from OPEN to HALF_OPEN (default: 30000) */
  resetTimeoutMs?: number;
  /** Optional callback when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState, name: string) => void;
};

export class CircuitBreaker {
  readonly name: string;
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly onStateChange?: CircuitBreakerOptions["onStateChange"];

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
    this.onStateChange = options.onStateChange;
  }

  getState(): CircuitState {
    // Auto-transition from OPEN -> HALF_OPEN when timeout has elapsed
    if (
      this.state === CircuitState.OPEN &&
      Date.now() - this.lastFailureTime >= this.resetTimeoutMs
    ) {
      this.transition(CircuitState.HALF_OPEN);
    }
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  /** Execute an async function through the circuit breaker */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
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
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /** Manually reset the circuit breaker to CLOSED */
  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;
    if (this.state !== CircuitState.CLOSED) {
      this.transition(CircuitState.CLOSED);
    }
  }

  private onSuccess(): void {
    // Any success in HALF_OPEN means the service recovered
    if (this.state === CircuitState.HALF_OPEN) {
      this.failureCount = 0;
      this.transition(CircuitState.CLOSED);
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount += 1;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Probe failed — go back to OPEN
      this.transition(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED && this.failureCount >= this.failureThreshold) {
      this.transition(CircuitState.OPEN);
    }
  }

  private transition(to: CircuitState): void {
    const from = this.state;
    this.state = to;
    this.onStateChange?.(from, to, this.name);
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
