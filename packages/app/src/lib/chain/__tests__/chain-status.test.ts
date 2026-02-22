import { describe, it, expect } from "vitest";
import {
  mapStage,
  mapPaymentStatus,
  resolveEffectiveChainStatus,
  deriveOrderStatus,
} from "../chain-status";

describe("mapStage", () => {
  it("maps status 0 to 待处理", () => {
    expect(mapStage(0)).toBe("待处理");
  });
  it("maps status 1 to 已确认", () => {
    expect(mapStage(1)).toBe("已确认");
  });
  it("maps status 2-4 to 进行中", () => {
    expect(mapStage(2)).toBe("进行中");
    expect(mapStage(3)).toBe("进行中");
    expect(mapStage(4)).toBe("进行中");
  });
  it("maps status 5 to 已完成", () => {
    expect(mapStage(5)).toBe("已完成");
  });
  it("maps status 6 to 已取消", () => {
    expect(mapStage(6)).toBe("已取消");
  });
});

describe("mapPaymentStatus", () => {
  it("maps known statuses", () => {
    expect(mapPaymentStatus(0)).toBe("未支付");
    expect(mapPaymentStatus(1)).toBe("撮合费已付");
    expect(mapPaymentStatus(5)).toBe("已结算");
    expect(mapPaymentStatus(6)).toBe("已取消");
  });
  it("returns 未知 for unknown status", () => {
    expect(mapPaymentStatus(99)).toBe("未知");
  });
});

describe("resolveEffectiveChainStatus", () => {
  it("returns incoming when no existing order", () => {
    expect(resolveEffectiveChainStatus(null, 3)).toBe(3);
  });

  it("returns incoming when existing has no chainStatus", () => {
    expect(resolveEffectiveChainStatus({ chainStatus: undefined, meta: {} }, 3)).toBe(3);
  });

  it("keeps local status when it is higher (no regression)", () => {
    expect(resolveEffectiveChainStatus({ chainStatus: 5, meta: {} }, 2)).toBe(5);
  });

  it("uses incoming when it is higher", () => {
    expect(resolveEffectiveChainStatus({ chainStatus: 2, meta: {} }, 5)).toBe(5);
  });

  it("falls back to meta.chain.status when chainStatus is undefined", () => {
    expect(
      resolveEffectiveChainStatus({ chainStatus: undefined, meta: { chain: { status: 4 } } }, 2)
    ).toBe(4);
  });

  it("prefers chainStatus over meta.chain.status", () => {
    expect(resolveEffectiveChainStatus({ chainStatus: 3, meta: { chain: { status: 5 } } }, 1)).toBe(
      3
    );
  });
});

describe("deriveOrderStatus", () => {
  it("derives all fields from a single status", () => {
    const result = deriveOrderStatus(5);
    expect(result).toEqual({
      chainStatus: 5,
      paymentStatus: "已结算",
      stage: "已完成",
      displayStatus: "已结算",
    });
  });

  it("derives for status 0", () => {
    const result = deriveOrderStatus(0);
    expect(result).toEqual({
      chainStatus: 0,
      paymentStatus: "未支付",
      stage: "待处理",
      displayStatus: "未支付",
    });
  });

  it("displayStatus matches paymentStatus", () => {
    for (const status of [0, 1, 2, 3, 4, 5, 6]) {
      const result = deriveOrderStatus(status);
      expect(result.displayStatus).toBe(result.paymentStatus);
    }
  });
});
