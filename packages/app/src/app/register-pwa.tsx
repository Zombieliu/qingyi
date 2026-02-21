"use client";
import { useEffect } from "react";

declare global {
  interface Window {
    serwist:
      | {
          register: () => void;
        }
      | undefined;
  }
}

export default function RegisterPWA() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (window.serwist?.register) {
      window.serwist.register();
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // ignore registration errors when sw.js is not available
    });
  }, []);

  return null;
}
