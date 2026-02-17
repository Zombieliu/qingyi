"use client";

import { useCallback, useEffect, useRef } from "react";

type BackoffPollOptions = {
  enabled: boolean;
  baseMs: number;
  maxMs: number;
  onPoll: () => Promise<boolean>;
};

export function useBackoffPoll(options: BackoffPollOptions) {
  const { enabled, baseMs, maxMs, onPoll } = options;
  const delayRef = useRef(baseMs);
  const timerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const schedule = useCallback(
    (immediate = false) => {
      clearTimer();
      if (!enabled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const delay = immediate ? 0 : delayRef.current;
      timerRef.current = window.setTimeout(async () => {
        if (inFlightRef.current) {
          schedule(false);
          return;
        }
        inFlightRef.current = true;
        let ok = false;
        try {
          ok = await onPoll();
        } catch {
          ok = false;
        } finally {
          inFlightRef.current = false;
        }
        delayRef.current = ok ? baseMs : Math.min(maxMs, Math.round(delayRef.current * 1.7));
        schedule(false);
      }, delay);
    },
    [baseMs, enabled, maxMs, onPoll]
  );

  useEffect(() => {
    delayRef.current = baseMs;
    if (!enabled) {
      clearTimer();
      return;
    }
    schedule(true);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        schedule(true);
      } else {
        clearTimer();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }
    return () => {
      clearTimer();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };
  }, [baseMs, enabled, schedule]);
}
