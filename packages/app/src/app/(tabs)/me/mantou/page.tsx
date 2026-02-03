"use client";

import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCurrentAddress } from "@/lib/qy-chain";
import { useMantouBalance } from "@/app/components/mantou-provider";

type WithdrawItem = {
  id: string;
  amount: number;
  status: string;
  account?: string;
  note?: string;
  createdAt: number;
};

type TxItem = {
  id: string;
  type: string;
  amount: number;
  note?: string;
  createdAt: number;
};

export default function MantouPage() {
  const { balance, frozen, refresh } = useMantouBalance();
  const [amount, setAmount] = useState(0);
  const [account, setAccount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [withdraws, setWithdraws] = useState<WithdrawItem[]>([]);
  const [transactions, setTransactions] = useState<TxItem[]>([]);

  const available = useMemo(() => Number(balance || 0), [balance]);

  useEffect(() => {
    const load = async () => {
      const address = getCurrentAddress();
      if (!address) return;
      const [withdrawRes, txRes] = await Promise.all([
        fetch(`/api/mantou/withdraw?address=${address}&page=1&pageSize=10`),
        fetch(`/api/mantou/transactions?address=${address}&page=1&pageSize=10`),
      ]);
      if (withdrawRes.ok) {
        const data = await withdrawRes.json();
        setWithdraws(Array.isArray(data?.items) ? data.items : []);
      }
      if (txRes.ok) {
        const data = await txRes.json();
        setTransactions(Array.isArray(data?.items) ? data.items : []);
      }
    };
    load();
  }, []);

  const submit = async () => {
    if (submitting) return;
    const address = getCurrentAddress();
    if (!address) {
      setMsg("请先登录 Passkey 钱包");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setMsg("请输入正确的提现数量");
      return;
    }
    if (!account.trim()) {
      setMsg("请填写收款账号");
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/mantou/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, amount, account: account.trim(), note: note.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data?.error || "提交失败");
        return;
      }
      await refresh();
      const address = getCurrentAddress();
      if (address) {
        const res = await fetch(`/api/mantou/withdraw?address=${address}&page=1&pageSize=10`);
        if (res.ok) {
          const data = await res.json();
          setWithdraws(Array.isArray(data?.items) ? data.items : []);
        }
      }
      setAmount(0);
      setNote("");
      setMsg("已提交提现申请，等待后台审核");
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
          <span className="dl-time-text">馒头提现</span>
          <span className="dl-chip">打手专属</span>
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <Wallet size={16} />
          </span>
        </div>
      </header>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="text-sm font-semibold text-gray-900">我的馒头</div>
        <div className="mt-2 text-2xl font-bold text-emerald-600">{balance}</div>
        <div className="mt-1 text-xs text-slate-500">冻结中：{frozen}</div>
      </section>

      <section className="dl-card" style={{ padding: 16, marginTop: 12 }}>
        <div className="text-sm font-semibold text-gray-900">提现申请</div>
        <div className="mt-2 text-xs text-slate-500">只限打手使用，1:1 转换自用户支付钻石。</div>
        <div className="mt-4 grid gap-3">
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">提现数量</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              type="number"
              min={1}
              max={available}
              value={Number.isFinite(amount) && amount > 0 ? amount : ""}
              placeholder={`可提现 ${balance}`}
              onChange={(event) => setAmount(Number(event.target.value))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">收款账号</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="微信/支付宝账号"
              value={account}
              onChange={(event) => setAccount(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">备注（可选）</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="可填写打款说明"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="mt-4 w-full rounded-2xl bg-emerald-600 text-white py-2 text-sm font-semibold"
        >
          {submitting ? "提交中..." : "提交提现"}
        </button>
        {msg && <div className="mt-3 text-xs text-emerald-600">{msg}</div>}
      </section>

      <section className="dl-card" style={{ padding: 16, marginTop: 12 }}>
        <div className="text-sm font-semibold text-gray-900">提现记录</div>
        {withdraws.length === 0 ? (
          <div className="mt-3 text-xs text-slate-500">暂无提现记录</div>
        ) : (
          <div className="mt-3 grid gap-3">
            {withdraws.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-100 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">数量</span>
                  <span className="font-semibold text-emerald-600">{item.amount}</span>
                </div>
                <div className="mt-1 text-slate-500">状态：{item.status}</div>
                {item.account && <div className="mt-1 text-slate-500">账号：{item.account}</div>}
                {item.note && <div className="mt-1 text-slate-500">备注：{item.note}</div>}
                <div className="mt-1 text-slate-400">{new Date(item.createdAt).toLocaleString("zh-CN")}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="dl-card" style={{ padding: 16, marginTop: 12, marginBottom: 24 }}>
        <div className="text-sm font-semibold text-gray-900">馒头流水</div>
        {transactions.length === 0 ? (
          <div className="mt-3 text-xs text-slate-500">暂无流水</div>
        ) : (
          <div className="mt-3 grid gap-3">
            {transactions.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-100 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">{item.type}</span>
                  <span className="font-semibold text-emerald-600">{item.amount}</span>
                </div>
                {item.note && <div className="mt-1 text-slate-500">备注：{item.note}</div>}
                <div className="mt-1 text-slate-400">{new Date(item.createdAt).toLocaleString("zh-CN")}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
