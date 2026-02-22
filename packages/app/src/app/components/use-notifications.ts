"use client";
import { useEffect, useState, useCallback } from "react";
import { getCurrentAddress } from "@/lib/chain/qy-chain-lite";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  orderId?: string;
  read: boolean;
  createdAt: number;
};

/**
 * 未读通知数 hook — 轮询 + SSE 实时更新
 */
export function useUnreadCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const addr = getCurrentAddress();
    if (!addr) return;
    try {
      const res = await fetchWithUserAuth(
        `/api/notifications?address=${addr}&countOnly=1`,
        {},
        addr
      );
      if (res.ok) {
        const data = await res.json();
        setCount(data.unread ?? 0);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const addr = getCurrentAddress();
    if (!addr) return;
    // Initial fetch
    fetchWithUserAuth(`/api/notifications?address=${addr}&countOnly=1`, {}, addr)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setCount(data.unread ?? 0);
      })
      .catch(() => {});
    // Refresh every 30s
    const interval = setInterval(() => {
      fetchWithUserAuth(`/api/notifications?address=${addr}&countOnly=1`, {}, addr)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setCount(data.unread ?? 0);
        })
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Listen for SSE notification events
  useEffect(() => {
    const handler = () => {
      setCount((c) => c + 1);
    };
    window.addEventListener("qy:notification", handler);
    return () => window.removeEventListener("qy:notification", handler);
  }, []);

  return { count, refresh };
}
