"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { getCurrentAddress } from "@/lib/chain/qy-chain";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { StateBlock } from "@/app/components/state-block";
import { formatErrorMessage } from "@/lib/shared/error-utils";

type LedgerRecord = {
  id: string;
  userAddress: string;
  diamondAmount: number;
  amount?: number;
  currency?: string;
  channel?: string;
  status: string;
  orderId?: string;
  receiptId?: string;
  source?: string;
  note?: string;
  createdAt: number;
};

function formatStatus(status: string) {
  switch (status) {
    case "pending":
      return { label: "待支付", tone: "text-amber-600" };
    case "paid":
      return { label: "已支付", tone: "text-slate-600" };
    case "credited":
      return { label: "已入账", tone: "text-emerald-600" };
    case "failed":
      return { label: "失败", tone: "text-rose-600" };
    default:
      return { label: status, tone: "text-slate-500" };
  }
}

function formatChannel(channel?: string) {
  switch (channel) {
    case "alipay":
      return "支付宝";
    case "wechat_pay":
      return "微信支付";
    case "stripe":
      return "Stripe";
    case "manual":
      return "人工记账";
    default:
      return channel || "未知渠道";
  }
}

export default function WalletRecords() {
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = async (pageNo = 1, append = false) => {
    const address = getCurrentAddress();
    if (!address) {
      setError("请先登录账号查看明细");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithUserAuth(
        `/api/ledger/records?address=${address}&page=${pageNo}&pageSize=20`,
        {},
        address
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "加载失败");
      }
      const items = Array.isArray(data.items) ? (data.items as LedgerRecord[]) : [];
      setRecords(append ? [...records, ...items] : items);
      setPage(data.page || pageNo);
      setHasMore(Boolean(data.totalPages && data.page < data.totalPages));
    } catch (err) {
      setError(formatErrorMessage(err, "明细加载失败"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/wallet" className="dl-icon-circle" aria-label="返回充值">
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">充值明细</span>
          <span className="dl-chip">钻石</span>
        </div>
        <div className="dl-actions">
          <button
            className="dl-icon-circle"
            onClick={() => load(1, false)}
            aria-label="刷新明细"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} />
          </button>
        </div>
      </header>

      {loading && records.length === 0 ? (
        <StateBlock tone="loading" size="compact" title="加载中" description="正在获取充值明细" />
      ) : error ? (
        <StateBlock tone="danger" size="compact" title="加载失败" description={error} />
      ) : records.length === 0 ? (
        <StateBlock
          tone="empty"
          size="compact"
          title="暂无明细"
          description="完成充值后会显示在这里"
        />
      ) : (
        <div className="grid gap-3">
          {records.map((item) => {
            const status = formatStatus(item.status);
            return (
              <div key={item.id} className="dl-card" style={{ padding: 14 }}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">
                    +{item.diamondAmount} 钻石
                  </div>
                  <div className={`text-xs font-semibold ${status.tone}`}>{status.label}</div>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {formatChannel(item.channel)} ·{" "}
                  {item.amount ? `¥${item.amount.toFixed(2)}` : "金额待确认"}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  时间：{new Date(item.createdAt).toLocaleString()}
                </div>
                {(item.orderId || item.receiptId) && (
                  <div className="mt-1 text-xs text-gray-400">
                    单号：{item.orderId || item.receiptId}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="mt-4 flex justify-center">
          <button className="dl-tab-btn" onClick={() => load(page + 1, true)} disabled={loading}>
            {loading ? "加载中..." : "加载更多"}
          </button>
        </div>
      )}
    </div>
  );
}
