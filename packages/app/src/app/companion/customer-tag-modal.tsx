"use client";
import { useState } from "react";

type Props = {
  tagTarget: { orderId: string; userAddress: string };
  address: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function CustomerTagModal({ tagTarget, address, onClose, onSuccess }: Props) {
  const [tagForm, setTagForm] = useState({ tag: "difficult", note: "", severity: 1 });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/companion/customer-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: tagTarget.userAddress,
          tag: tagForm.tag,
          note: tagForm.note || undefined,
          severity: tagForm.severity,
          reportedBy: address,
        }),
      });
      if (res.ok) {
        onSuccess();
        onClose();
        setTagForm({ tag: "difficult", note: "", severity: 1 });
      }
    } catch {
      /* ignore */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-5 w-[90vw] max-w-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold mb-3">🏷️ 标记老板</div>
        <div className="text-[10px] text-gray-400 mb-3">仅陪练和运营可见，老板看不到</div>
        <label className="block text-xs text-gray-600 mb-1">标签类型</label>
        <select
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm mb-2"
          value={tagForm.tag}
          onChange={(e) => setTagForm((f) => ({ ...f, tag: e.target.value }))}
        >
          <option value="difficult">⚠️ 事多/难伺候</option>
          <option value="slow_pay">⏳ 拖延付款</option>
          <option value="rude">😤 态度差</option>
          <option value="no_show">👻 放鸽子/不上线</option>
          <option value="frequent_dispute">⚖️ 频繁争议</option>
          <option value="vip_treat">👑 VIP 优待</option>
          <option value="other">📌 其他</option>
        </select>
        <label className="block text-xs text-gray-600 mb-1">严重程度</label>
        <select
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm mb-2"
          value={tagForm.severity}
          onChange={(e) => setTagForm((f) => ({ ...f, severity: Number(e.target.value) }))}
        >
          <option value={1}>💡 提醒</option>
          <option value={2}>⚠️ 警告</option>
          <option value={3}>🚨 高危</option>
        </select>
        <label className="block text-xs text-gray-600 mb-1">备注（选填）</label>
        <input
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm mb-3"
          placeholder="具体情况说明..."
          value={tagForm.note}
          onChange={(e) => setTagForm((f) => ({ ...f, note: e.target.value }))}
        />
        <div className="flex gap-2">
          <button
            className="flex-1 rounded-lg bg-gray-100 py-2 text-sm text-gray-600"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="flex-1 rounded-lg bg-orange-500 py-2 text-sm text-white font-medium disabled:opacity-50"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? "提交中..." : "提交标记"}
          </button>
        </div>
      </div>
    </div>
  );
}
