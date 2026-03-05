import { describe, it, expect } from "vitest";
import {
  buildReconcileFailureMessage,
  EDGE_RUNTIME_INCOMPATIBLE_DB_ERROR,
  isEdgeRuntimeIncompatibleFailure,
  parseReconcileApiFailure,
} from "../error-utils";

describe("reconcile error utils", () => {
  it("parses typed api error payload", async () => {
    const response = new Response(
      JSON.stringify({
        error: EDGE_RUNTIME_INCOMPATIBLE_DB_ERROR,
        message: "reconcile currently requires Node runtime database access",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );

    const failure = await parseReconcileApiFailure(response);
    expect(failure).toEqual({
      code: EDGE_RUNTIME_INCOMPATIBLE_DB_ERROR,
      message: "reconcile currently requires Node runtime database access",
      status: 503,
    });
    expect(isEdgeRuntimeIncompatibleFailure(failure)).toBe(true);
  });

  it("falls back safely when response body is not json", async () => {
    const response = new Response("raw upstream error", {
      status: 502,
      headers: { "Content-Type": "text/plain" },
    });
    const failure = await parseReconcileApiFailure(response);
    expect(failure).toEqual({
      code: "request_failed",
      message: "request failed",
      status: 502,
    });
  });

  it("builds explicit degrade copy for edge runtime incompatibility", () => {
    const message = buildReconcileFailureMessage({
      code: EDGE_RUNTIME_INCOMPATIBLE_DB_ERROR,
      message: "x",
      status: 503,
    });
    expect(message).toContain("Edge Runtime");
    expect(message).toContain("Node Runtime");
  });

  it("builds generic copy for other failures", () => {
    const message = buildReconcileFailureMessage({
      code: "reconcile_failed",
      message: "database timeout",
      status: 500,
    });
    expect(message).toContain("500");
    expect(message).toContain("database timeout");
  });
});
