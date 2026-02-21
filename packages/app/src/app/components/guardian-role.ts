"use client";

import { useEffect, useState } from "react";
import { getCurrentAddress } from "@/lib/chain/qy-chain";
import { readCache, writeCache } from "@/lib/shared/client-cache";

type GuardianState = "checking" | "guardian" | "user";

const CACHE_TTL_MS = 5 * 60_000;

export function useGuardianStatus() {
  const [state, setState] = useState<GuardianState>("checking");
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let controller: AbortController | null = null;

    const load = () => {
      const addr = getCurrentAddress();
      setAddress(addr);
      if (!addr) {
        setState("user");
        return;
      }

      const cacheKey = `cache:guardian:${addr}`;
      const cached = readCache<{ isGuardian: boolean }>(cacheKey, CACHE_TTL_MS, true);
      if (cached) {
        setState(cached.value?.isGuardian ? "guardian" : "user");
      }

      if (controller) controller.abort();
      controller = new AbortController();
      const signal = controller.signal;

      fetch(`/api/guardians/status?address=${addr}`, { signal })
        .then((res) => {
          if (!res.ok) throw new Error("status_failed");
          return res.json().catch(() => ({}));
        })
        .then((data) => {
          const isGuardian = Boolean((data as { isGuardian?: boolean })?.isGuardian);
          writeCache(cacheKey, { isGuardian });
          setState(isGuardian ? "guardian" : "user");
        })
        .catch(() => {
          if (!cached) setState("user");
        });
    };

    load();
    window.addEventListener("storage", load);
    window.addEventListener("passkey-updated", load);
    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener("passkey-updated", load);
      if (controller) controller.abort();
    };
  }, []);

  return { state, isGuardian: state === "guardian", address };
}
