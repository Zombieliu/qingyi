import { describe, it, expect } from "vitest";
import { isChainOrder, canTransitionStage } from "../order-guard";

describe("isChainOrder", () => {
  it("returns true when chainDigest is present", () => {
    expect(isChainOrder({ chainDigest: "abc", chainStatus: undefined, source: "app" })).toBe(true);
  });
  it("returns true when chainStatus is defined", () => {
    expect(isChainOrder({ chainDigest: undefined, chainStatus: 1, source: "app" })).toBe(true);
  });
  it("returns true when source is chain", () => {
    expect(isChainOrder({ chainDigest: undefined, chainStatus: undefined, source: "chain" })).toBe(
      true
    );
  });
  it("returns false for non-chain order", () => {
    expect(isChainOrder({ chainDigest: undefined, chainStatus: undefined, source: "app" })).toBe(
      false
    );
  });
});

describe("canTransitionStage", () => {
  it("allows same stage", () => {
    expect(canTransitionStage("待处理", "待处理")).toBe(true);
  });
  it("allows forward transitions", () => {
    expect(canTransitionStage("待处理", "已确认")).toBe(true);
    expect(canTransitionStage("已确认", "进行中")).toBe(true);
    expect(canTransitionStage("进行中", "已完成")).toBe(true);
  });
  it("allows cancellation from non-terminal stages", () => {
    expect(canTransitionStage("待处理", "已取消")).toBe(true);
    expect(canTransitionStage("进行中", "已取消")).toBe(true);
  });
  it("blocks backward transitions", () => {
    expect(canTransitionStage("已完成", "进行中")).toBe(false);
    expect(canTransitionStage("已取消", "待处理")).toBe(false);
  });
  it("blocks transitions from terminal states", () => {
    expect(canTransitionStage("已完成", "已取消")).toBe(false);
    expect(canTransitionStage("已取消", "已完成")).toBe(false);
  });
});
