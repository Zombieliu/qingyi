import { describe, it, expect, vi, beforeEach } from "vitest";

describe("api-timing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  async function freshModule() {
    vi.resetModules();
    return import("../api-timing");
  }

  it("returns handler response for fast requests", async () => {
    const { withTiming } = await freshModule();
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withTiming(handler, "test");
    const res = await wrapped();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("logs warning for slow requests (>2000ms)", async () => {
    const { withTiming } = await freshModule();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Mock performance.now to simulate slow request
    let callCount = 0;
    vi.spyOn(performance, "now").mockImplementation(() => {
      callCount++;
      // First call returns 0 (start), second call returns 3000 (end)
      return callCount === 1 ? 0 : 3000;
    });

    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withTiming(handler, "slow-endpoint");
    await wrapped();

    expect(warnSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(logged.type).toBe("slow_api");
    expect(logged.path).toBe("slow-endpoint");
    expect(logged.durationMs).toBe(3000);
    expect(logged.status).toBe(200);
  });

  it("logs error when handler throws", async () => {
    const { withTiming } = await freshModule();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const handler = vi.fn(async () => {
      throw new Error("DB connection failed");
    });
    const wrapped = withTiming(handler, "error-endpoint");

    await expect(wrapped()).rejects.toThrow("DB connection failed");

    expect(errorSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.type).toBe("api_error");
    expect(logged.path).toBe("error-endpoint");
    expect(logged.error).toBe("DB connection failed");
  });

  it("preserves response status", async () => {
    const { withTiming } = await freshModule();
    const handler = vi.fn(async () => new Response("created", { status: 201 }));
    const wrapped = withTiming(handler, "create");
    const res = await wrapped();
    expect(res.status).toBe(201);
  });

  it("uses label in log output, defaults to 'unknown'", async () => {
    const { withTiming } = await freshModule();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Without label
    const handler = vi.fn(async () => {
      throw new Error("fail");
    });
    const wrapped = withTiming(handler);

    await expect(wrapped()).rejects.toThrow("fail");

    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.path).toBe("unknown");
  });

  it("does not log warning for fast requests under threshold", async () => {
    const { withTiming } = await freshModule();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    let callCount = 0;
    vi.spyOn(performance, "now").mockImplementation(() => {
      callCount++;
      return callCount === 1 ? 0 : 500; // 500ms - under 2000ms threshold
    });

    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withTiming(handler, "fast-endpoint");
    await wrapped();

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("logs non-Error thrown values as string", async () => {
    const { withTiming } = await freshModule();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const handler = vi.fn(async () => {
      throw "string-error";
    });
    const wrapped = withTiming(handler, "string-throw");

    await expect(wrapped()).rejects.toBe("string-error");

    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.error).toBe("string-error");
  });

  it("uses 'unknown' label for slow request when no label provided", async () => {
    const { withTiming } = await freshModule();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    let callCount = 0;
    vi.spyOn(performance, "now").mockImplementation(() => {
      callCount++;
      return callCount === 1 ? 0 : 3000;
    });

    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withTiming(handler); // no label
    await wrapped();

    const logged = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(logged.path).toBe("unknown");
  });
});
