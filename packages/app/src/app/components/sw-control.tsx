"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, ArrowUpCircle } from "lucide-react";

type SwState = {
  active?: string;
  waiting?: string;
  installing?: string;
  supported: boolean;
};

type StatusKey =
  | "idle"
  | "checking"
  | "ready"
  | "no-sw"
  | "unsupported"
  | "forcing"
  | "clearing"
  | "error";

function shortScript(url?: string) {
  if (!url) return "—";
  try {
    const parsed = new URL(url);
    const name = parsed.pathname.split("/").pop() || parsed.pathname;
    return name.length > 20 ? `${name.slice(0, 8)}…${name.slice(-8)}` : name;
  } catch {
    return url.length > 20 ? `${url.slice(0, 8)}…${url.slice(-8)}` : url;
  }
}

export default function SwControl() {
  const [state, setState] = useState<SwState>({ supported: false });
  const [status, setStatus] = useState<StatusKey>("idle");
  const [message, setMessage] = useState("");

  const readRegistration = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      setState({ supported: false });
      setStatus("unsupported");
      return null;
    }
    setState((prev) => ({ ...prev, supported: true }));
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      setStatus("no-sw");
      setState((prev) => ({ ...prev, active: undefined, waiting: undefined, installing: undefined }));
      return null;
    }
    setState({
      supported: true,
      active: reg.active?.scriptURL,
      waiting: reg.waiting?.scriptURL,
      installing: reg.installing?.scriptURL,
    });
    if (reg.waiting) {
      setStatus("ready");
    } else if (status === "ready") {
      setStatus("idle");
    }
    return reg;
  }, [status]);

  useEffect(() => {
    readRegistration();
    if (!("serviceWorker" in navigator)) return;
    const onChange = () => {
      readRegistration();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
    };
  }, [readRegistration]);

  const checkUpdate = async () => {
    setStatus("checking");
    setMessage("");
    try {
      const reg = await readRegistration();
      if (!reg) {
        setMessage("未注册 Service Worker");
        return;
      }
      await reg.update();
      await readRegistration();
      setMessage(reg.waiting ? "发现新版本，请强制更新" : "已是最新版本");
    } catch {
      setStatus("error");
      setMessage("检查失败");
    } finally {
      setStatus((prev) => (prev === "error" ? prev : "idle"));
    }
  };

  const forceUpdate = async () => {
    setStatus("forcing");
    setMessage("");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setMessage("未注册 Service Worker");
        return;
      }
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).serwist?.messageSkipWaiting?.();
        await reg.update();
      }
      setMessage("已触发更新，正在刷新");
      setTimeout(() => window.location.reload(), 600);
    } catch {
      setStatus("error");
      setMessage("更新失败");
    } finally {
      setStatus((prev) => (prev === "error" ? prev : "idle"));
    }
  };

  const clearCache = async () => {
    setStatus("clearing");
    setMessage("");
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
      }
      setMessage("已清理缓存，请刷新确认");
    } catch {
      setStatus("error");
      setMessage("清理失败");
    } finally {
      setStatus((prev) => (prev === "error" ? prev : "idle"));
    }
  };

  const label = useMemo(() => {
    if (!state.supported) return "浏览器不支持";
    if (status === "no-sw") return "未注册";
    return shortScript(state.waiting || state.active);
  }, [state.active, state.supported, state.waiting, status]);

  return (
    <div>
      <div className="admin-meta">SW：{label}</div>
      {message ? <div className="admin-meta-faint" style={{ marginTop: 4 }}>{message}</div> : null}
      <div className="admin-actions" style={{ marginTop: 8, justifyContent: "flex-start" }}>
        <button
          className="admin-btn ghost"
          onClick={checkUpdate}
          disabled={status === "checking" || status === "forcing" || status === "clearing"}
        >
          <RefreshCw size={14} />
          {status === "checking" ? "检查中..." : "检查更新"}
        </button>
        <button className="admin-btn secondary" onClick={forceUpdate} disabled={status === "checking" || status === "forcing" || status === "clearing"}>
          <ArrowUpCircle size={14} />
          {status === "forcing" ? "更新中..." : "强制更新"}
        </button>
        <button className="admin-btn ghost" onClick={clearCache} disabled={status === "checking" || status === "forcing" || status === "clearing"}>
          {status === "clearing" ? "清理中..." : "清理缓存"}
        </button>
      </div>
    </div>
  );
}
