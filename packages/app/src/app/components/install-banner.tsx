"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type DeferredPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }>; };

export function InstallBanner() {
  const [deferred, setDeferred] = useState<DeferredPrompt | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as DeferredPrompt);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const res = await deferred.userChoice;
    if (res.outcome === "accepted") setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-30 mx-auto max-w-2xl rounded-2xl border border-white/15 bg-black/70 px-4 py-3 text-white shadow-2xl backdrop-blur">
      <div className="flex items-center gap-3">
        <Download className="h-5 w-5 text-cyan-300" />
        <div className="flex-1 text-sm">
          <div className="font-semibold">添加 情谊电竞 到桌面</div>
          <div className="text-white/70">离线也能打开，获得类原生体验。</div>
        </div>
        <button
          onClick={install}
          className="rounded-full bg-cyan-500 px-3 py-1 text-xs font-semibold text-slate-950 shadow-md shadow-cyan-500/30"
        >
          安装
        </button>
        <button
          onClick={() => setVisible(false)}
          className="rounded-full border border-white/20 px-2 py-1 text-[11px] text-white/70"
        >
          稍后
        </button>
      </div>
    </div>
  );
}
