"use client";
import { useEffect, useState } from "react";
import { ArrowUpCircle, X } from "lucide-react";

export default function PwaUpdateToast() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // serwist is injected by @serwist/next on window
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sw = (window as any).serwist;
    if (!sw) return;

    const onWaiting = () => setReady(true);
    const onControlling = () => {
      window.location.reload();
    };

    sw.addEventListener?.("waiting", onWaiting);
    sw.addEventListener?.("controlling", onControlling);

    return () => {
      sw?.removeEventListener?.("waiting", onWaiting);
      sw?.removeEventListener?.("controlling", onControlling);
    };
  }, []);

  const activate = async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).serwist?.messageSkipWaiting?.();
        await reg?.update();
      }
      setTimeout(() => window.location.reload(), 600);
    } catch {
      setTimeout(() => window.location.reload(), 600);
    }
  };

  if (!ready) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-lg rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-3 text-slate-800 shadow-2xl backdrop-blur"
    >
      <div className="flex items-center gap-3">
        <ArrowUpCircle className="h-5 w-5 text-emerald-500" aria-hidden />
        <div className="flex-1 text-sm">
          <div className="font-semibold">有新版本可用</div>
          <div className="text-slate-500">点击更新立即刷新体验。</div>
        </div>
        <button
          onClick={activate}
          className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
        >
          更新
        </button>
        <button
          aria-label="关闭更新提示"
          onClick={() => setReady(false)}
          className="rounded-full p-2 text-slate-400 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
