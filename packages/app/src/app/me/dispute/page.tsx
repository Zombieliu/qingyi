"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { getCurrentAddress } from "@/lib/chain/qy-chain-lite";
import { t } from "@/lib/i18n/t";

const REASONS = [
  { value: "service_quality", label: t("me.dispute.i223") },
  { value: "no_show", label: t("me.dispute.i224") },
  { value: "wrong_service", label: t("me.dispute.i225") },
  { value: "overcharge", label: t("me.dispute.i226") },
  { value: "other", label: t("me.dispute.i227") },
] as const;

export default function DisputePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId") || "";

  const [reason, setReason] = useState<string>("service_quality");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!orderId) {
      setError(t("me.dispute.i228"));
      return;
    }
    if (description.length < 10) {
      setError(t("me.dispute.i229"));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const address = getCurrentAddress();
      const res = await fetchWithUserAuth(
        "/api/disputes",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, reason, description }),
        },
        address
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "提交失败");
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("me.dispute.i230"));
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="page-container" style={{ padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>争议已提交</h2>
        <p style={{ color: "#64748b", marginBottom: 24 }}>
          我们会在 24 小时内处理您的争议，请留意通知。
        </p>
        <button
          className="btn-primary"
          onClick={() => router.push("/me/orders")}
          style={{ padding: "10px 24px", borderRadius: 8 }}
        >
          返回订单列表
        </button>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ padding: 16, maxWidth: 600, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>发起争议</h1>

      {orderId && (
        <div
          style={{
            padding: 12,
            background: "#f1f5f9",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          订单号：{orderId}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
          争议原因
        </label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            fontSize: 14,
          }}
        >
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
          详细描述
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("me.dispute.i231")}
          rows={5}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            fontSize: 14,
            resize: "vertical",
          }}
        />
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
          {description.length}/1000
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            background: "#fef2f2",
            color: "#dc2626",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting || !orderId}
        style={{
          width: "100%",
          padding: "12px 0",
          borderRadius: 8,
          background: submitting ? "#94a3b8" : "#ef4444",
          color: "white",
          fontWeight: 600,
          fontSize: 16,
          border: "none",
          cursor: submitting ? "not-allowed" : "pointer",
        }}
      >
        {submitting ? t("me.dispute.i232") : t("me.dispute.i233")}
      </button>

      <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 12, textAlign: "center" }}>
        提交后将进入人工审核，通常 24 小时内处理完毕
      </p>
    </div>
  );
}
