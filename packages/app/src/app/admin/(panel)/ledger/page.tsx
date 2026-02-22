"use client";
import { t } from "@/lib/i18n/i18n-client";

import { useState } from "react";
import { Send } from "lucide-react";
import { StateBlock } from "@/app/components/state-block";

export default function LedgerPage() {
  const [form, setForm] = useState({
    user: "",
    amount: "",
    receiptId: "",
    note: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");

  const submit = async () => {
    setError("");
    setResult("");
    if (!form.user.trim() || !form.amount.trim() || !form.receiptId.trim()) {
      setError(t("admin.ledger.001"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ledger/credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: form.user.trim(),
          amount: form.amount.trim(),
          receiptId: form.receiptId.trim(),
          note: form.note.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "写入失败");
      } else {
        setResult("apply.ledger_done");
        setForm({ user: "", amount: "", receiptId: "", note: "" });
      }
    } catch {
      setError(t("admin.ledger.002"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>记账登记</h3>
            <p>用于人工补记余额或对账后的记录写入。</p>
          </div>
        </div>
        <div className="admin-form" style={{ marginTop: 12 }}>
          <label className="admin-field">
            用户账号
            <input
              className="admin-input"
              placeholder="0x..."
              value={form.user}
              onChange={(event) => setForm((prev) => ({ ...prev, user: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            金额（整数）
            <input
              className="admin-input"
              placeholder="1000"
              value={form.amount}
              onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            业务凭证号
            <input
              className="admin-input"
              placeholder="pay_20260130_0001"
              value={form.receiptId}
              onChange={(event) => setForm((prev) => ({ ...prev, receiptId: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            备注（可选）
            <input
              className="admin-input"
              placeholder={t("admin.ledger.003")}
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
            />
          </label>
        </div>
        <button
          className="admin-btn primary"
          style={{ marginTop: 16 }}
          onClick={submit}
          disabled={loading}
        >
          <Send size={16} style={{ marginRight: 6 }} />
          {loading ? "提交中..." : t("admin.ledger.004")}
        </button>
        {result ? (
          <div style={{ marginTop: 14 }}>
            <StateBlock
              tone="success"
              size="compact"
              title={t("admin.ledger.005")}
              description={result}
            />
          </div>
        ) : null}
        {error ? (
          <div style={{ marginTop: 14 }}>
            <StateBlock
              tone="danger"
              size="compact"
              title={t("admin.ledger.006")}
              description={error}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
