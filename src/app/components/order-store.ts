"use client";

export type LocalOrder = {
  id: string;
  user: string;
  item: string;
  amount: number;
  status: string;
  time: string; // ISO
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
  const next = [order, ...list].slice(0, 20);
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("orders-updated"));
}
