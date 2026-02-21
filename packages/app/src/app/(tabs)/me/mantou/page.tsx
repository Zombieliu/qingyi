"use client";

import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCurrentAddress } from "@/lib/chain/qy-chain";
import { useMantouBalance } from "@/app/components/mantou-provider";
import { readCache, writeCache } from "@/lib/shared/client-cache";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { StateBlock } from "@/app/components/state-block";
import { formatErrorMessage } from "@/lib/shared/error-utils";
import { useGuardianStatus } from "@/app/components/guardian-role";
import { PLAYER_STATUS_OPTIONS, type PlayerStatus } from "@/lib/admin/admin-types";
import { formatFullDateTime } from "@/lib/shared/date-utils";

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
  const { isGuardian, state: guardianState, address: guardianAddress } = useGuardianStatus();
  const [amount, setAmount] = useState(0);
  const [account, setAccount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{
    tone: "success" | "warning" | "danger";
    title: string;
  } | null>(null);
  const [withdraws, setWithdraws] = useState<WithdrawItem[]>([]);
  const [transactions, setTransactions] = useState<TxItem[]>([]);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [statusHintTone, setStatusHintTone] = useState<"success" | "warning">("warning");
  const cacheTtlMs = 60_000;

  const available = useMemo(() => Number(balance || 0), [balance]);

  useEffect(() => {
    const load = async () => {
      const address = getCurrentAddress();
      if (!address) return;
      const withdrawCacheKey = `cache:mantou:withdraw:${address}:page1`;
      const txCacheKey = `cache:mantou:transactions:${address}:page1`;
      const cachedWithdraw = readCache<WithdrawItem[]>(withdrawCacheKey, cacheTtlMs, true);
      if (cachedWithdraw) {
        setWithdraws(Array.isArray(cachedWithdraw.value) ? cachedWithdraw.value : []);
      }
      const cachedTx = readCache<TxItem[]>(txCacheKey, cacheTtlMs, true);
      if (cachedTx) {
        setTransactions(Array.isArray(cachedTx.value) ? cachedTx.value : []);
      }
      try {
        const [withdrawRes, txRes] = await Promise.all([
          fetchWithUserAuth(
            `/api/mantou/withdraw?address=${address}&page=1&pageSize=10`,
            {},
            address
          ),
          fetchWithUserAuth(
            `/api/mantou/transactions?address=${address}&page=1&pageSize=10`,
            {},
            address
          ),
        ]);
        if (withdrawRes.ok) {
          const data = await withdrawRes.json();
          const next = Array.isArray(data?.items) ? data.items : [];
          setWithdraws(next);
          writeCache(withdrawCacheKey, next);
        }
        if (txRes.ok) {
          const data = await txRes.json();
          const next = Array.isArray(data?.items) ? data.items : [];
          setTransactions(next);
          writeCache(txCacheKey, next);
        }
      } catch {
        // ignore load errors
      }
    };
    load();
  }, []);

  useEffect(() => {
    const loadStatus = async () => {
      if (guardianState === "checking") return;
      const address = guardianAddress;
      if (!address) {
        setPlayerStatus(null);
        setStatusHint("请先登录账号");
        return;
      }
      if (!isGuardian) {
        setPlayerStatus(null);
        setStatusHint("未绑定陪练档案，暂不可设置状态");
        return;
      }
      setStatusLoading(true);
      setStatusHint(null);
      try {
        const res = await fetchWithUserAuth(
          `/api/players/me/status?address=${address}`,
          {},
          address
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 404) {
            setStatusHint("未绑定陪练档案，请联系运营");
          } else if (res.status === 403) {
            setStatusHint("无陪练权限，暂不可设置状态");
          } else {
            setStatusHint(data?.error || "状态加载失败");
          }
          setPlayerStatus(null);
          return;
        }
        const data = await res.json().catch(() => ({}));
        setPlayerStatus((data?.status as PlayerStatus) || null);
      } catch {
        setStatusHint("状态加载失败");
      } finally {
        setStatusLoading(false);
      }
    };
    loadStatus();
  }, [guardianAddress, guardianState, isGuardian]);

  const updateStatus = async (nextStatus: PlayerStatus) => {
    if (statusSaving) return;
    const address = guardianAddress;
    if (!address) {
      setStatusHint("请先登录账号");
      return;
    }
    setStatusSaving(true);
    setStatusHint(null);
    try {
      const res = await fetchWithUserAuth(
        "/api/players/me/status",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, status: nextStatus }),
        },
        address
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusHintTone("warning");
        setStatusHint(data?.error || "状态更新失败");
        return;
      }
      setPlayerStatus((data?.status as PlayerStatus) || nextStatus);
      setStatusHintTone("success");
      setStatusHint("状态已更新");
      setTimeout(() => setStatusHint(null), 2000);
    } catch (error) {
      setStatusHint(formatErrorMessage(error, "状态更新失败"));
    } finally {
      setStatusSaving(false);
    }
  };

  const submit = async () => {
    if (submitting) return;
    const address = getCurrentAddress();
    if (!address) {
      setStatus({ tone: "warning", title: "请先登录账号" });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus({ tone: "warning", title: "请输入正确的提现数量" });
      return;
    }
    if (!account.trim()) {
      setStatus({ tone: "warning", title: "请填写收款账号" });
      return;
    }
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetchWithUserAuth(
        "/api/mantou/withdraw",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, amount, account: account.trim(), note: note.trim() }),
        },
        address
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ tone: "danger", title: data?.error || "提交失败" });
        return;
      }
      await refresh({ force: true });
      const addressNext = getCurrentAddress();
      if (addressNext) {
        const res = await fetchWithUserAuth(
          `/api/mantou/withdraw?address=${addressNext}&page=1&pageSize=10`,
          {},
          addressNext
        );
        if (res.ok) {
          const data = await res.json();
          const next = Array.isArray(data?.items) ? data.items : [];
          setWithdraws(next);
          writeCache(`cache:mantou:withdraw:${addressNext}:page1`, next);
        }
      }
      setAmount(0);
      setNote("");
      setStatus({ tone: "success", title: "已提交提现申请，等待后台审核" });
    } catch (error) {
      setStatus({ tone: "danger", title: formatErrorMessage(error, "提交失败") });
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
          <span className="dl-chip">陪练专属</span>
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
        <div className="text-sm font-semibold text-gray-900">接单状态</div>
        <div className="mt-2 text-xs text-slate-500">仅陪练账号可设置接单状态</div>
        {guardianState === "checking" || statusLoading ? (
          <div className="mt-3">
            <StateBlock tone="loading" size="compact" title="状态加载中" />
          </div>
        ) : !guardianAddress ? (
          <div className="mt-3">
            <StateBlock
              tone="warning"
              size="compact"
              title="请先登录账号"
              description="登录后可设置接单状态"
            />
          </div>
        ) : !isGuardian ? (
          <div className="mt-3">
            <StateBlock
              tone="warning"
              size="compact"
              title="未绑定陪练档案"
              description="请联系运营绑定陪练"
            />
          </div>
        ) : playerStatus ? (
          <div className="mt-3">
            <div className="text-xs text-slate-500">当前状态：{playerStatus}</div>
            <div className="lc-tabs" style={{ marginTop: 8 }}>
              {PLAYER_STATUS_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`lc-tab-btn ${playerStatus === option ? "is-active" : ""}`}
                  onClick={() => updateStatus(option)}
                  disabled={statusSaving || playerStatus === option}
                >
                  {statusSaving && playerStatus === option ? "更新中..." : option}
                </button>
              ))}
            </div>
            {statusHint && (
              <div className="mt-3">
                <StateBlock tone={statusHintTone} size="compact" title={statusHint} />
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <StateBlock
              tone="warning"
              size="compact"
              title={statusHint || "暂无可用状态"}
              description="请联系运营绑定陪练档案"
            />
          </div>
        )}
      </section>

      <section className="dl-card" style={{ padding: 16, marginTop: 12 }}>
        <div className="text-sm font-semibold text-gray-900">提现申请</div>
        <div className="mt-2 text-xs text-slate-500">只限陪练使用，1:1 转换自用户支付钻石。</div>
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
        {status && (
          <div className="mt-3">
            <StateBlock tone={status.tone} size="compact" title={status.title} />
          </div>
        )}
      </section>

      <section className="dl-card" style={{ padding: 16, marginTop: 12 }}>
        <div className="text-sm font-semibold text-gray-900">提现记录</div>
        {withdraws.length === 0 ? (
          <div className="mt-3">
            <StateBlock
              tone="empty"
              size="compact"
              title="暂无提现记录"
              description="提交提现后会出现在这里"
            />
          </div>
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
                <div className="mt-1 text-slate-400">{formatFullDateTime(item.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="dl-card" style={{ padding: 16, marginTop: 12, marginBottom: 24 }}>
        <div className="text-sm font-semibold text-gray-900">馒头流水</div>
        {transactions.length === 0 ? (
          <div className="mt-3">
            <StateBlock
              tone="empty"
              size="compact"
              title="暂无流水"
              description="暂无馒头流水记录"
            />
          </div>
        ) : (
          <div className="mt-3 grid gap-3">
            {transactions.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-100 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">{item.type}</span>
                  <span className="font-semibold text-emerald-600">{item.amount}</span>
                </div>
                {item.note && <div className="mt-1 text-slate-500">备注：{item.note}</div>}
                <div className="mt-1 text-slate-400">{formatFullDateTime(item.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
