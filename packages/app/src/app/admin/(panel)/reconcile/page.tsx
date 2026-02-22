"use client";

import { useState } from "react";
import { RefreshCw, AlertTriangle, CheckCircle, Wrench } from "lucide-react";
import { t } from "@/lib/i18n/i18n-client";

type ReconcileItem = {
  orderId: string;
  localStatus: string;
  chainStatus?: number;
  paymentStatus: string;
  mismatch: boolean;
  issue?: string;
};

type Report = {
  total: number;
  matched: number;
  mismatched: number;
  items: ReconcileItem[];
  generatedAt: string;
};

type FixResult = {
  fixed: number;
  skipped: number;
  details: Array<{ orderId: string; action: string }>;
};

export default function ReconcilePage() {
  const [report, setReport] = useState<Report | null>(null);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [days, setDays] = useState(7);

  const runReconcile = async () => {
    setLoading(true);
    setFixResult(null);
    try {
      const res = await fetch(`/api/admin/reconcile?days=${days}`);
      if (res.ok) setReport(await res.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const runAutoFix = async () => {
    if (!confirm(t("admin.panel.reconcile.i079"))) return;
    setFixing(true);
    try {
      const res = await fetch(`/api/admin/reconcile?days=${days}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setFixResult(data.autoFix);
        setReport(data.report);
      }
    } catch {
      /* ignore */
    } finally {
      setFixing(false);
    }
  };

  return (
    <div className="admin-page">
      <h1 className="admin-title">支付对账</h1>

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 14 }}>
            检查范围：
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              style={{
                marginLeft: 8,
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #e2e8f0",
              }}
            >
              <option value={1}>最近 1 天</option>
              <option value={3}>最近 3 天</option>
              <option value={7}>最近 7 天</option>
              <option value={14}>最近 14 天</option>
              <option value={30}>最近 30 天</option>
            </select>
          </label>
          <button className="admin-btn" onClick={runReconcile} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {loading ? t("admin.panel.reconcile.i080") : t("admin.panel.reconcile.i081")}
          </button>
          {report && report.mismatched > 0 && (
            <button
              className="admin-btn"
              onClick={runAutoFix}
              disabled={fixing}
              style={{ background: "#f59e0b", color: "#fff" }}
            >
              <Wrench size={14} />
              {fixing ? t("admin.panel.reconcile.i082") : t("admin.panel.reconcile.i083")}
            </button>
          )}
        </div>
      </div>

      {report && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div className="admin-card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{report.total}</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>检查订单</div>
            </div>
            <div className="admin-card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#10b981" }}>
                <CheckCircle size={20} style={{ display: "inline", verticalAlign: "middle" }} />{" "}
                {report.matched}
              </div>
              <div style={{ fontSize: 13, color: "#64748b" }}>一致</div>
            </div>
            <div className="admin-card" style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: report.mismatched > 0 ? "#ef4444" : "#10b981",
                }}
              >
                <AlertTriangle size={20} style={{ display: "inline", verticalAlign: "middle" }} />{" "}
                {report.mismatched}
              </div>
              <div style={{ fontSize: 13, color: "#64748b" }}>不一致</div>
            </div>
          </div>

          {fixResult && (
            <div
              className="admin-card"
              style={{ marginBottom: 16, background: "#f0fdf4", border: "1px solid #bbf7d0" }}
            >
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                ✅ 自动修复完成：修复 {fixResult.fixed} 项，跳过 {fixResult.skipped} 项
              </div>
              {fixResult.details.map((d, i) => (
                <div key={i} style={{ fontSize: 13, color: "#16a34a" }}>
                  {d.orderId}: {d.action}
                </div>
              ))}
            </div>
          )}

          {report.items.length > 0 && (
            <div className="admin-card">
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>不一致项</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                      <th style={{ padding: "8px 12px", textAlign: "left" }}>订单ID</th>
                      <th style={{ padding: "8px 12px", textAlign: "left" }}>本地状态</th>
                      <th style={{ padding: "8px 12px", textAlign: "left" }}>链上状态</th>
                      <th style={{ padding: "8px 12px", textAlign: "left" }}>支付状态</th>
                      <th style={{ padding: "8px 12px", textAlign: "left" }}>问题</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.items.map((item) => (
                      <tr key={item.orderId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>
                          {item.orderId.slice(0, 12)}...
                        </td>
                        <td style={{ padding: "8px 12px" }}>{item.localStatus}</td>
                        <td style={{ padding: "8px 12px" }}>{item.chainStatus ?? "-"}</td>
                        <td style={{ padding: "8px 12px" }}>{item.paymentStatus}</td>
                        <td style={{ padding: "8px 12px", color: "#ef4444" }}>{item.issue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {report.items.length === 0 && (
            <div className="admin-card" style={{ textAlign: "center", padding: 40 }}>
              <CheckCircle size={48} color="#10b981" style={{ margin: "0 auto 12px" }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: "#10b981" }}>全部一致</div>
              <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
                最近 {days} 天的订单状态全部正常
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 12, textAlign: "right" }}>
            生成时间：{new Date(report.generatedAt).toLocaleString()}
          </div>
        </>
      )}
    </div>
  );
}
