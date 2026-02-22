"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { getCurrentAddress } from "@/lib/chain/qy-chain-lite";
import type { DisputeRecord } from "@/lib/services/dispute-service";
import { t } from "@/lib/i18n/t";

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: t("me.disputes.i130"), color: "#f59e0b", icon: Clock },
  reviewing: { label: t("me.disputes.i131"), color: "#3b82f6", icon: AlertTriangle },
  resolved_refund: { label: t("me.disputes.i132"), color: "#10b981", icon: CheckCircle },
  resolved_reject: { label: t("me.disputes.i133"), color: "#ef4444", icon: XCircle },
  resolved_partial: { label: t("me.disputes.i134"), color: "#8b5cf6", icon: CheckCircle },
};

const REASON_MAP: Record<string, string> = {
  service_quality: t("me.disputes.i135"),
  no_show: t("me.disputes.i136"),
  wrong_service: t("me.disputes.i137"),
  overcharge: t("me.disputes.i138"),
  other: t("me.disputes.i139"),
};

export default function DisputeListPage() {
  const [disputes, setDisputes] = useState<DisputeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const address = getCurrentAddress();
        const res = await fetchWithUserAuth("/api/disputes", {}, address);
        if (res.ok) {
          const data = await res.json();
          setDisputes(data.disputes || []);
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/me" className="dl-icon-circle" aria-label={t("me.disputes.i001")}>
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">我的争议</span>
        </div>
      </header>

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>加载中...</div>
        ) : disputes.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <p style={{ color: "#94a3b8" }}>暂无争议记录</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {disputes.map((d) => {
              const status = STATUS_MAP[d.status] || STATUS_MAP.pending;
              const Icon = status.icon;
              return (
                <Link
                  key={d.id}
                  href={`/me/dispute?orderId=${d.orderId}`}
                  style={{
                    display: "block",
                    padding: 16,
                    background: "#fff",
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      {REASON_MAP[d.reason] || d.reason}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        padding: "2px 8px",
                        borderRadius: 12,
                        background: `${status.color}15`,
                        color: status.color,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Icon size={12} />
                      {status.label}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: "#64748b", marginBottom: 8, lineHeight: 1.4 }}>
                    {d.description.length > 80 ? d.description.slice(0, 80) + "..." : d.description}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      color: "#94a3b8",
                    }}
                  >
                    <span>订单 {d.orderId.slice(0, 12)}...</span>
                    <span>{new Date(d.createdAt).toLocaleDateString()}</span>
                  </div>
                  {d.refundAmount !== undefined && d.status.startsWith("resolved") && (
                    <div
                      style={{ marginTop: 8, fontSize: 13, color: status.color, fontWeight: 500 }}
                    >
                      {d.status === "resolved_reject"
                        ? t("me.disputes.i002")
                        : `退款 ¥${d.refundAmount}`}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
