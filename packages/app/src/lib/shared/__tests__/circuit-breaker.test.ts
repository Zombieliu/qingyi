import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CircuitBreaker,
  CircuitBreakerError,
  CircuitState,
  stripeCircuit,
  kookCircuit,
  chainRpcCircuit,
  type CircuitBreakerOptions,
} from "../../shared/circuit-breaker";

function createBreaker(overrides?: Partial<CircuitBreakerOptions>) {
  return new CircuitBreaker({
    name: "test",
    failureThreshold: 3,
    resetTimeoutMs: 1000,
    enableSharedState: false,
    ...overrides,
  });
}

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Initial state ----

  it("starts in CLOSED state with zero failures", () => {
    const cb = createBreaker();
    expect(cb.getState()).toBe(CircuitState.CLOSED);
    expect(cb.getFailureCount()).toBe(0);
  });

  it("syncs shared OPEN state across breaker instances when enabled", async () => {
    const name = `shared-${Date.now()}`;
    const source = createBreaker({
      name,
      failureThreshold: 1,
      enableSharedState: true,
      sharedSyncIntervalMs: 0,
    });
    const follower = createBreaker({
      name,
      failureThreshold: 1,
      enableSharedState: true,
      sharedSyncIntervalMs: 0,
    });

    await expect(source.execute(() => Promise.reject(new Error("x")))).rejects.toThrow("x");
    await expect(follower.execute(() => Promise.resolve("ok"))).rejects.toThrow(
      CircuitBreakerError
    );
  });

  // ---- CLOSED -> OPEN ----

  it("transitions to OPEN after reaching failure threshold", async () => {
    const onChange = vi.fn();
    const cb = createBreaker({ failureThreshold: 3, onStateChange: onChange });

    const fail = () => Promise.reject(new Error("fail"));

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow("fail");
    }

    expect(cb.getState()).toBe(CircuitState.OPEN);
    expect(cb.getFailureCount()).toBe(3);
    expect(onChange).toHaveBeenCalledWith(CircuitState.CLOSED, CircuitState.OPEN, "test");
  });

  it("stays CLOSED when failures are below threshold", async () => {
    const cb = createBreaker({ failureThreshold: 5 });
    const fail = () => Promise.reject(new Error("fail"));

    for (let i = 0; i < 4; i++) {
      await expect(cb.execute(fail)).rejects.toThrow("fail");
    }

    expect(cb.getState()).toBe(CircuitState.CLOSED);
    expect(cb.getFailureCount()).toBe(4);
  });

  // ---- OPEN rejects requests ----

  it("rejects calls immediately when OPEN", async () => {
    const cb = createBreaker({ failureThreshold: 1 });
    await expect(cb.execute(() => Promise.reject(new Error("x")))).rejects.toThrow("x");

    expect(cb.getState()).toBe(CircuitState.OPEN);

    await expect(cb.execute(() => Promise.resolve("ok"))).rejects.toThrow(CircuitBreakerError);
    await expect(cb.execute(() => Promise.resolve("ok"))).rejects.toThrow(/OPEN/);
  });

  it("CircuitBreakerError carries circuit metadata", async () => {
    const cb = createBreaker({ failureThreshold: 1 });
    await expect(cb.execute(() => Promise.reject(new Error("x")))).rejects.toThrow();

    try {
      await cb.execute(() => Promise.resolve("ok"));
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CircuitBreakerError);
      const err = e as CircuitBreakerError;
      expect(err.circuitName).toBe("test");
      expect(err.circuitState).toBe(CircuitState.OPEN);
    }
  });

  // ---- OPEN -> HALF_OPEN after timeout ----

  it("transitions to HALF_OPEN after reset timeout elapses", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const cb = createBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 5000,
      onStateChange: onChange,
    });

    await expect(cb.execute(() => Promise.reject(new Error("x")))).rejects.toThrow();
    expect(cb.getState()).toBe(CircuitState.OPEN);

    vi.advanceTimersByTime(5000);
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
    expect(onChange).toHaveBeenCalledWith(CircuitState.OPEN, CircuitState.HALF_OPEN, "test");

    vi.useRealTimers();
  });

  // ---- HALF_OPEN -> CLOSED on success ----

  it("transitions from HALF_OPEN to CLOSED on successful probe", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const cb = createBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      onStateChange: onChange,
    });

    await expect(cb.execute(() => Promise.reject(new Error("x")))).rejects.toThrow();
    vi.advanceTimersByTime(1000);
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);

    const result = await cb.execute(() => Promise.resolve("recovered"));
    expect(result).toBe("recovered");
    expect(cb.getState()).toBe(CircuitState.CLOSED);
    expect(cb.getFailureCount()).toBe(0);
    expect(onChange).toHaveBeenCalledWith(CircuitState.HALF_OPEN, CircuitState.CLOSED, "test");

    vi.useRealTimers();
  });

  // ---- HALF_OPEN -> OPEN on failure ----

  it("transitions from HALF_OPEN back to OPEN on failed probe", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const cb = createBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      onStateChange: onChange,
    });

    await expect(cb.execute(() => Promise.reject(new Error("x")))).rejects.toThrow();
    vi.advanceTimersByTime(1000);
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);

    await expect(cb.execute(() => Promise.reject(new Error("still broken")))).rejects.toThrow(
      "still broken"
    );
    expect(cb.getState()).toBe(CircuitState.OPEN);
    expect(onChange).toHaveBeenCalledWith(CircuitState.HALF_OPEN, CircuitState.OPEN, "test");

    vi.useRealTimers();
  });

  // ---- Success resets failure count in CLOSED ----

  it("resets failure count on success while CLOSED", async () => {
    const cb = createBreaker({ failureThreshold: 3 });

    await expect(cb.execute(() => Promise.reject(new Error("x")))).rejects.toThrow();
    await expect(cb.execute(() => Promise.reject(new Error("x")))).rejects.toThrow();
    expect(cb.getFailureCount()).toBe(2);

    await cb.execute(() => Promise.resolve("ok"));
    expect(cb.getFailureCount()).toBe(0);
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  // ---- Manual reset ----

  it("reset() restores CLOSED state from OPEN", async () => {
    const cb = createBreaker({ failureThreshold: 1 });
    await expect(cb.execute(() => Promise.reject(new Error("x")))).rejects.toThrow();
    expect(cb.getState()).toBe(CircuitState.OPEN);

    cb.reset();
    expect(cb.getState()).toBe(CircuitState.CLOSED);
    expect(cb.getFailureCount()).toBe(0);

    // Should work normally after reset
    const result = await cb.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("reset() is a no-op when already CLOSED", () => {
    const onChange = vi.fn();
    const cb = createBreaker({ onStateChange: onChange });
    cb.reset();
    expect(onChange).not.toHaveBeenCalled();
  });

  // ---- Passes through return values ----

  it("returns the value from the wrapped function", async () => {
    const cb = createBreaker();
    const result = await cb.execute(() => Promise.resolve({ data: "hello" }));
    expect(result).toEqual({ data: "hello" });
  });

  // ---- Pre-configured instances ----

  it("exports pre-configured stripeCircuit", () => {
    expect(stripeCircuit).toBeInstanceOf(CircuitBreaker);
    expect(stripeCircuit.name).toBe("stripe");
    expect(stripeCircuit.getState()).toBe(CircuitState.CLOSED);
  });

  it("exports pre-configured kookCircuit", () => {
    expect(kookCircuit).toBeInstanceOf(CircuitBreaker);
    expect(kookCircuit.name).toBe("kook");
  });

  it("exports pre-configured chainRpcCircuit", () => {
    expect(chainRpcCircuit).toBeInstanceOf(CircuitBreaker);
    expect(chainRpcCircuit.name).toBe("chain-rpc");
  });

  // ---- Full lifecycle: CLOSED -> OPEN -> HALF_OPEN -> CLOSED ----

  it("completes full state lifecycle", async () => {
    vi.useFakeTimers();
    const states: string[] = [];
    const cb = createBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 500,
      onStateChange: (_from: CircuitState, to: CircuitState) => states.push(to),
    });

    // CLOSED: 2 failures -> OPEN
    await expect(cb.execute(() => Promise.reject(new Error("1")))).rejects.toThrow();
    await expect(cb.execute(() => Promise.reject(new Error("2")))).rejects.toThrow();
    expect(cb.getState()).toBe(CircuitState.OPEN);

    // Wait for timeout -> HALF_OPEN
    vi.advanceTimersByTime(500);
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);

    // Successful probe -> CLOSED
    await cb.execute(() => Promise.resolve("ok"));
    expect(cb.getState()).toBe(CircuitState.CLOSED);

    expect(states).toEqual([CircuitState.OPEN, CircuitState.HALF_OPEN, CircuitState.CLOSED]);

    vi.useRealTimers();
  });

  // ---- Full lifecycle: CLOSED -> OPEN -> HALF_OPEN -> OPEN -> HALF_OPEN -> CLOSED ----

  it("handles repeated OPEN/HALF_OPEN cycles before recovery", async () => {
    vi.useFakeTimers();
    const cb = createBreaker({ failureThreshold: 1, resetTimeoutMs: 200 });

    // Trip the breaker
    await expect(cb.execute(() => Promise.reject(new Error("x")))).rejects.toThrow();
    expect(cb.getState()).toBe(CircuitState.OPEN);

    // First probe fails
    vi.advanceTimersByTime(200);
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
    await expect(cb.execute(() => Promise.reject(new Error("still down")))).rejects.toThrow();
    expect(cb.getState()).toBe(CircuitState.OPEN);

    // Second probe succeeds
    vi.advanceTimersByTime(200);
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
    await cb.execute(() => Promise.resolve("recovered"));
    expect(cb.getState()).toBe(CircuitState.CLOSED);

    vi.useRealTimers();
  });
});
