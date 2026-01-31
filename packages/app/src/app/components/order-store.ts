"use client";

export type LocalOrder = {
  id: string;
  user: string;
  item: string;
  amount: number;
  status: string;
  time: string; // ISO
  chainDigest?: string;
  serviceFee?: number;
  serviceFeePaid?: boolean;
  depositPaid?: boolean;
  playerPaid?: boolean;
  playerDue?: number;
  driver?: {
    name: string;
    car: string;
    eta: string;
    plate?: string;
    phone?: string;
    price?: number;
  };
};

const KEY = "dl_orders";

export function loadOrders(): LocalOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocalOrder[];
  } catch {
    return [];
  }
}

export function addOrder(order: LocalOrder) {
  if (typeof window === "undefined") return;
  const list = loadOrders();
  const existsIdx = list.findIndex((o) => o.id === order.id);
  if (existsIdx >= 0) {
    list.splice(existsIdx, 1);
  }
  const next = [order, ...list].slice(0, 20);
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("orders-updated"));
}

export function updateOrder(id: string, patch: Partial<LocalOrder>) {
  if (typeof window === "undefined") return;
  const list = loadOrders();
  const next = list.map((o) => (o.id === id ? { ...o, ...patch } : o));
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("orders-updated"));
}

export function removeOrder(id: string) {
  if (typeof window === "undefined") return;
  const list = loadOrders().filter((o) => o.id !== id);
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("orders-updated"));
}
