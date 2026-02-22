"use client";
import { t } from "@/lib/i18n/i18n-client";

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
      return t("wallet.records.001");
    case "wechat_pay":
      return t("wallet.records.002");
    case "stripe":
      return "Stripe";
    case "manual":
      return t("wallet.records.003");
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
      setError(t("wallet.records.004"));
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
      setError(formatErrorMessage(err, t("wallet.records.005")));
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
          <Link href="/wallet" className="dl-icon-circle" aria-label={t("wallet.records.006")}>
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">充值明细</span>
          <span className="dl-chip">钻石</span>
        </div>
        <div className="dl-actions">
          <button
            className="dl-icon-circle"
            onClick={() => load(1, false)}
            aria-label={t("wallet.records.007")}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} />
          </button>
        </div>
      </header>

      {loading && records.length === 0 ? (
        <StateBlock
          tone="loading"
          size="compact"
          title={t("wallet.records.009")}
          description={t("wallet.records.008")}
        />
      ) : error ? (
        <StateBlock
          tone="danger"
          size="compact"
          title={t("wallet.records.010")}
          description={error}
        />
      ) : records.length === 0 ? (
        <StateBlock
          tone="empty"
          size="compact"
          title={t("wallet.records.011")}
          description={t("wallet.records.012")}
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
                  {item.amount ? `¥${item.amount.toFixed(2)}` : t("wallet.records.013")}
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
            {loading ? "加载中..." : t("wallet.records.014")}
          </button>
        </div>
      )}
    </div>
  );
}
