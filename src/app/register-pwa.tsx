"use client";
import { useEffect } from "react";

declare global {
  interface Window {
    serwist: {
      register: () => void;
    } | undefined;
  }
}

export default function RegisterPWA() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator && window.serwist) {
      window.serwist.register();
    }
  }, []);

  return null;
}
