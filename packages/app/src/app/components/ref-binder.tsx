"use client";

import { useEffect } from "react";
import { getCurrentAddress } from "@/lib/chain/qy-chain";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";

const REF_STORAGE_KEY = "qy_ref_code";

export function captureRefCode() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  if (ref && ref.trim()) {
    localStorage.setItem(REF_STORAGE_KEY, ref.trim());
  }
}

export function RefBinder() {
  useEffect(() => {
    captureRefCode();
  }, []);

  useEffect(() => {
    const tryBind = async () => {
      const refCode = localStorage.getItem(REF_STORAGE_KEY);
      if (!refCode) return;
      const address = getCurrentAddress();
      if (!address) return;
      try {
        const res = await fetchWithUserAuth(
          "/api/referral/bind",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, refCode }),
          },
          address
        );
        if (res.ok || res.status === 409) {
          localStorage.removeItem(REF_STORAGE_KEY);
        }
      } catch {
        // silent — will retry next visit
      }
    };
    tryBind();
  }, []);

  return null;
}
