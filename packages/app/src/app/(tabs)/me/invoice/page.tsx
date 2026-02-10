"use client";

import Link from "next/link";
import { ArrowLeft, FileText, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PASSKEY_STORAGE_KEY } from "@/app/components/passkey-wallet";
import { StateBlock } from "@/app/components/state-block";

const STORAGE_KEY = "qy_invoice_requests_v1";

type InvoiceRequest = {
  id: string;
  title: string;
  amount?: number;
  status: string;
  createdAt: number;
};

function loadLocalRequests(): InvoiceRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as InvoiceRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistLocalRequests(list: InvoiceRequest[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 5)));
}

export default function InvoicePage() {
  const [form, setForm] = useState({
    title: "",
    taxId: "",
    email: "",
    contact: "",
    orderId: "",
    amount: "",
    address: "",
    note: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [requests, setRequests] = useState<InvoiceRequest[]>([]);

  const walletAddress = useMemo(() => {
    if (typeof window === "undefined") return "";
    try {
      const raw = localStorage.getItem(PASSKEY_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as { address?: string }).address || "" : "";
    } catch {
      return "";
    }
  }, []);

  useEffect(() => {
    setRequests(loadLocalRequests());
  }, []);

  const submit = async () => {
    if (!form.title.trim()) {
      setHint("请填写发票抬头");
      return;
    }
    if (!form.email.trim()) {
      setHint("请填写收票邮箱");
      return;
    }
    setSubmitting(true);
    setHint(null);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          taxId: form.taxId.trim(),
          email: form.email.trim(),
          contact: form.contact.trim(),
          orderId: form.orderId.trim(),
          amount: form.amount ? Number(form.amount) : undefined,
          address: form.address.trim(),
          note: form.note.trim(),
          userAddress: walletAddress,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHint(data?.error || "提交失败，请稍后重试");
        return;
      }
      const next: InvoiceRequest = {
        id: data?.id || `INV-${Date.now()}`,
        title: form.title.trim(),
        amount: form.amount ? Number(form.amount) : undefined,
        status: "待审核",
        createdAt: Date.now(),
      };
      const updated = [next, ...requests];
      setRequests(updated);
      persistLocalRequests(updated);
      setHint("申请已提交，财务审核后将开具电子发票");
      setForm((prev) => ({ ...prev, note: "" }));
    } catch {
      setHint("网络异常，请稍后再试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/me" className="dl-icon-circle" aria-label="返回我的">
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">发票申请</span>
          <span className="dl-chip">电子发票</span>
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <FileText size={16} />
          </span>
        </div>
      </header>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="text-sm font-semibold text-gray-900">开票说明</div>
        <div className="mt-2 text-xs text-slate-500">
          填写真实的抬头与税号，电子发票将发送至邮箱。若有多笔订单，可在备注中说明。
        </div>
      </section>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="text-sm font-semibold text-gray-900">提交开票申请</div>
        <div className="mt-3 grid gap-3">
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">发票抬头</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="公司名称或个人"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">税号（选填）</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="统一社会信用代码"
              value={form.taxId}
              onChange={(event) => setForm((prev) => ({ ...prev, taxId: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">收票邮箱</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="example@mail.com"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">联系方式</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="手机 / 微信"
              value={form.contact}
              onChange={(event) => setForm((prev) => ({ ...prev, contact: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">订单号（选填）</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="如有多单可留空"
              value={form.orderId}
              onChange={(event) => setForm((prev) => ({ ...prev, orderId: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">开票金额（选填）</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="¥"
              value={form.amount}
              onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">开户地址（选填）</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="省市区 / 街道"
              value={form.address}
              onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">备注</label>
            <textarea
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm min-h-[90px]"
              placeholder="补充需求（如多个订单号）"
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="mt-4 w-full rounded-2xl bg-slate-900 text-white py-2 text-sm font-semibold flex items-center justify-center gap-2"
        >
          <Send size={16} />
          {submitting ? "提交中..." : "提交申请"}
        </button>
        {hint && <div className="mt-3 text-xs text-amber-600">{hint}</div>}
      </section>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="text-sm font-semibold text-gray-900">最近申请</div>
        {requests.length === 0 ? (
          <div className="mt-3">
            <StateBlock tone="empty" size="compact" title="暂无记录" description="提交申请后会显示在这里" />
          </div>
        ) : (
          <div className="mt-3 grid gap-3">
            {requests.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">{item.title}</div>
                  <span className="text-xs text-emerald-600">{item.status}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">申请号：{item.id}</div>
                {item.amount ? (
                  <div className="text-xs text-slate-500 mt-1">金额：¥{item.amount}</div>
                ) : null}
                <div className="text-[11px] text-slate-400 mt-2">
                  {new Date(item.createdAt).toLocaleString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
