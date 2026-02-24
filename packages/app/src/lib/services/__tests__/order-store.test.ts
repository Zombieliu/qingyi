import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadOrders, addOrder, updateOrder, removeOrder, type LocalOrder } from "../order-store";

const makeOrder = (id: string, overrides?: Partial<LocalOrder>): LocalOrder => ({
  id,
  user: "user1",
  item: "item1",
  amount: 100,
  status: "pending",
  time: new Date().toISOString(),
  ...overrides,
});

describe("order-store", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("loadOrders", () => {
    it("returns empty array when nothing stored", () => {
      expect(loadOrders()).toEqual([]);
    });

    it("returns parsed orders from localStorage", () => {
      const orders = [makeOrder("o1"), makeOrder("o2")];
      localStorage.setItem("dl_orders", JSON.stringify(orders));
      const result = loadOrders();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("o1");
    });

    it("returns empty array for invalid JSON", () => {
      localStorage.setItem("dl_orders", "bad-json");
      expect(loadOrders()).toEqual([]);
    });
  });

  describe("addOrder", () => {
    it("adds order to localStorage", () => {
      addOrder(makeOrder("o1"));
      const orders = loadOrders();
      expect(orders).toHaveLength(1);
      expect(orders[0].id).toBe("o1");
    });

    it("prepends new order", () => {
      addOrder(makeOrder("o1"));
      addOrder(makeOrder("o2"));
      const orders = loadOrders();
      expect(orders[0].id).toBe("o2");
      expect(orders[1].id).toBe("o1");
    });

    it("replaces existing order with same id", () => {
      addOrder(makeOrder("o1", { status: "pending" }));
      addOrder(makeOrder("o1", { status: "completed" }));
      const orders = loadOrders();
      expect(orders).toHaveLength(1);
      expect(orders[0].status).toBe("completed");
    });

    it("limits to 20 orders", () => {
      for (let i = 0; i < 25; i++) {
        addOrder(makeOrder(`o${i}`));
      }
      expect(loadOrders()).toHaveLength(20);
    });

    it("dispatches orders-updated event", () => {
      const handler = vi.fn();
      window.addEventListener("orders-updated", handler);
      addOrder(makeOrder("o1"));
      expect(handler).toHaveBeenCalled();
      window.removeEventListener("orders-updated", handler);
    });
  });

  describe("updateOrder", () => {
    it("updates order fields by id", () => {
      addOrder(makeOrder("o1", { status: "pending" }));
      updateOrder("o1", { status: "completed" });
      const orders = loadOrders();
      expect(orders[0].status).toBe("completed");
    });

    it("does not affect other orders", () => {
      addOrder(makeOrder("o1"));
      addOrder(makeOrder("o2"));
      updateOrder("o1", { status: "done" });
      const orders = loadOrders();
      const o2 = orders.find((o) => o.id === "o2");
      expect(o2?.status).toBe("pending");
    });

    it("dispatches orders-updated event", () => {
      addOrder(makeOrder("o1"));
      const handler = vi.fn();
      window.addEventListener("orders-updated", handler);
      updateOrder("o1", { status: "done" });
      expect(handler).toHaveBeenCalled();
      window.removeEventListener("orders-updated", handler);
    });
  });

  describe("removeOrder", () => {
    it("removes order by id", () => {
      addOrder(makeOrder("o1"));
      addOrder(makeOrder("o2"));
      removeOrder("o1");
      const orders = loadOrders();
      expect(orders).toHaveLength(1);
      expect(orders[0].id).toBe("o2");
    });

    it("dispatches orders-updated event", () => {
      addOrder(makeOrder("o1"));
      const handler = vi.fn();
      window.addEventListener("orders-updated", handler);
      removeOrder("o1");
      expect(handler).toHaveBeenCalled();
      window.removeEventListener("orders-updated", handler);
    });
  });

  describe("server-side (no window)", () => {
    it("loadOrders returns empty array when window is undefined", () => {
      const origWindow = globalThis.window;
      // @ts-expect-error - simulating server environment
      delete globalThis.window;
      expect(loadOrders()).toEqual([]);
      globalThis.window = origWindow;
    });

    it("addOrder does nothing when window is undefined", () => {
      const origWindow = globalThis.window;
      // @ts-expect-error - simulating server environment
      delete globalThis.window;
      // Should not throw
      addOrder(makeOrder("o1"));
      globalThis.window = origWindow;
    });

    it("updateOrder does nothing when window is undefined", () => {
      const origWindow = globalThis.window;
      // @ts-expect-error - simulating server environment
      delete globalThis.window;
      // Should not throw
      updateOrder("o1", { status: "done" });
      globalThis.window = origWindow;
    });

    it("removeOrder does nothing when window is undefined", () => {
      const origWindow = globalThis.window;
      // @ts-expect-error - simulating server environment
      delete globalThis.window;
      // Should not throw
      removeOrder("o1");
      globalThis.window = origWindow;
    });
  });
});
