"use client";

import { useState } from "react";
import { ShieldCheck, KeyRound } from "lucide-react";
import SwControl from "@/app/components/sw-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MotionCard } from "@/components/ui/motion";

export default function AdminLoginPage() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!token.trim()) {
      setError("请输入后台密钥");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "登录失败，请检查密钥");
        return;
      }
      window.location.href = "/admin";
    } catch {
      setError("网络异常，请稍后再试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login">
      <MotionCard className="admin-card admin-login-card">
        <div className="admin-card-header">
          <div>
            <h2 className="admin-title">运营管理后台</h2>
            <p className="admin-subtitle">使用后台密钥登录，开始订单与运营管理</p>
          </div>
        </div>
        <div className="admin-badge warm" style={{ marginBottom: 12 }}>
          若看不到“检查更新/强制更新”，请清除缓存或手动卸载 Service Worker。
        </div>
        <div className="admin-chip" style={{ marginBottom: 14 }}>
          <ShieldCheck size={14} />
          后台密钥（数据库或环境变量）
        </div>
        <form className="admin-form" onSubmit={handleSubmit}>
          <label className="admin-field">
            后台密钥
            <div style={{ position: "relative" }}>
              <KeyRound
                size={16}
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#64748b" }}
              />
              <Input
                className="admin-input"
                style={{ paddingLeft: 36 }}
                type="password"
                placeholder="请输入 ADMIN_DASH_TOKEN"
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </div>
          </label>
          {error ? (
            <div className="admin-badge warm" style={{ alignSelf: "flex-start" }}>
              {error}
            </div>
          ) : null}
          <Button variant="admin" size="unstyled" className="primary" type="submit" disabled={loading}>
            {loading ? "登录中..." : "进入后台"}
          </Button>
        </form>
        <div className="admin-helper">
          提示：可在“密钥管理”中创建后台密钥；也可在 `.env.local` 中设置 `ADMIN_DASH_TOKEN` 或 `ADMIN_TOKENS`。
        </div>
        <div style={{ marginTop: 16 }}>
          <SwControl />
        </div>
      </MotionCard>
    </div>
  );
}
