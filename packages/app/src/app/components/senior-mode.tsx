"use client";

import { useEffect } from "react";
import { SENIOR_MODE_COOKIE_KEY, getCookie, setCookie } from "@/lib/shared/cookie-utils";

export const SENIOR_MODE_STORAGE_KEY = "qy_senior_mode_v1";

export function applySeniorMode(enabled: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (enabled) {
    root.setAttribute("data-senior", "1");
  } else {
    root.removeAttribute("data-senior");
  }
}

function readSeniorMode() {
  if (typeof window === "undefined") return false;
  // Try cookie first, fallback to localStorage for migration
  const cookieValue = getCookie(SENIOR_MODE_COOKIE_KEY);
  if (cookieValue !== undefined) {
    return cookieValue === "1";
  }
  const storageValue = localStorage.getItem(SENIOR_MODE_STORAGE_KEY);
  if (storageValue === "1") {
    // Migrate to cookie
    setCookie(SENIOR_MODE_COOKIE_KEY, "1");
    return true;
  }
  return false;
}

export default function SeniorModeProvider() {
  useEffect(() => {
    applySeniorMode(readSeniorMode());

    const handleStorage = (event: StorageEvent) => {
      if (event.key === SENIOR_MODE_STORAGE_KEY) {
        const enabled = event.newValue === "1";
        setCookie(SENIOR_MODE_COOKIE_KEY, enabled ? "1" : "0");
        applySeniorMode(enabled);
      }
    };
    const handleCustom = () => {
      applySeniorMode(readSeniorMode());
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("senior-mode-updated", handleCustom);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("senior-mode-updated", handleCustom);
    };
  }, []);

  return null;
}
