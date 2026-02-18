"use client";

import { useEffect } from "react";

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
  return localStorage.getItem(SENIOR_MODE_STORAGE_KEY) === "1";
}

export default function SeniorModeProvider() {
  useEffect(() => {
    applySeniorMode(readSeniorMode());

    const handleStorage = (event: StorageEvent) => {
      if (event.key === SENIOR_MODE_STORAGE_KEY) {
        applySeniorMode(readSeniorMode());
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
