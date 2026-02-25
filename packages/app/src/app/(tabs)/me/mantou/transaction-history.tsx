"use client";
import { t } from "@/lib/i18n/t";
import { StateBlock } from "@/app/components/state-block";
import { formatFullDateTime } from "@/lib/shared/date-utils";
import type { TxItem } from "./mantou-types";

const TYPE_LABELS: Record<string, { label: string; direction: "in" | "out" }> = {
  credit: { label: "入账", direction: "in" },
  withdraw_request: { label: "提现申请", direction: "out" },
  withdraw_approved: { label: "提现批准", direction: "out" },
  withdraw_paid: { label: "提现已付", direction: "out" },
};

function formatTxType(type: string) {
  const info = TYPE_LABELS[type];
  if (!info) return { label: type, direction: "in" as const };
  return info;
}

export function TransactionHistory({ transactions }: { transactions: TxItem[] }) {
  return (
    <section className="dl-card" style={{ padding: 16, marginTop: 12, marginBottom: 24 }}>
      <div className="text-sm font-semibold text-gray-900">{t("ui.mantou.100")}</div>
      {transactions.length === 0 ? (
        <div className="mt-3">
          <StateBlock
            tone="empty"
            size="compact"
            title={t("me.mantou.015")}
            description={t("me.mantou.016")}
          />
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          {transactions.map((item) => {
            const tx = formatTxType(item.type);
            const isOut = tx.direction === "out";
            return (
              <div key={item.id} className="rounded-2xl border border-slate-100 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">{tx.label}</span>
                  <span className={`font-semibold ${isOut ? "text-rose-500" : "text-emerald-600"}`}>
                    {isOut ? "-" : "+"}
                    {item.amount}
                  </span>
                </div>
                {item.note && <div className="mt-1 text-slate-500">备注：{item.note}</div>}
                <div className="mt-1 text-slate-400">{formatFullDateTime(item.createdAt)}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
