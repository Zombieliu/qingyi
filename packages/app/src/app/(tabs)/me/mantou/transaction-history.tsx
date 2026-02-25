"use client";
import { t } from "@/lib/i18n/t";
import { StateBlock } from "@/app/components/state-block";
import { formatFullDateTime } from "@/lib/shared/date-utils";
import type { TxItem } from "./mantou-types";

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
  );
}
