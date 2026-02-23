"use client";

import { useEffect, useRef, useCallback, useState } from "react";

export type OrderEventData = {
  type: "status_change" | "assigned" | "completed" | "cancelled" | "deposit_paid";
  orderId: string;
  status?: string;
  stage?: string;
  timestamp: number;
};

type UseOrderEventsOptions = {
  address: string;
  enabled?: boolean;
  onEvent: (event: OrderEventData) => void;
};

/**
 * SSE hook：监听订单状态实时推送
 *
 * 使用 EventSource 连接 /api/events，收到事件时回调 onEvent。
 * 连接断开后自动重连（EventSource 原生行为）。
 * Returns { connected } so callers can disable polling when SSE is active.
 */
export function useOrderEvents({ address, enabled = true, onEvent }: UseOrderEventsOptions) {
  const onEventRef = useRef(onEvent);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const connect = useCallback(() => {
    if (!address || !enabled) return null;

    const url = `/api/events?address=${encodeURIComponent(address)}`;
    const es = new EventSource(url);

    es.onopen = () => setConnected(true);

    es.addEventListener("order", (e) => {
      try {
        const data = JSON.parse(e.data) as OrderEventData;
        onEventRef.current(data);
      } catch {
        // malformed event, skip
      }
    });

    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects
    };

    return es;
  }, [address, enabled]);

  useEffect(() => {
    const es = connect();
    return () => {
      es?.close();
      setConnected(false);
    };
  }, [connect]);

  return { connected };
}
