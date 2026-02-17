"use client";

import { useEffect, useRef, useState } from "react";

type AdminToastDetail = {
  message: string;
  traceId?: string | null;
};

export default function AdminToast() {
  const [toast, setToast] = useState<AdminToastDetail | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<AdminToastDetail>).detail;
      if (!detail?.message) return;
      setToast(detail);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => setToast(null), 5000);
    };
    window.addEventListener("admin:toast", handler as EventListener);
    return () => {
      window.removeEventListener("admin:toast", handler as EventListener);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (!toast) return null;

  return (
    <div className="admin-toast" role="status" aria-live="polite">
      <div className="admin-toast-title">{toast.message}</div>
      {toast.traceId ? <div className="admin-toast-meta">traceId: {toast.traceId}</div> : null}
    </div>
  );
}
