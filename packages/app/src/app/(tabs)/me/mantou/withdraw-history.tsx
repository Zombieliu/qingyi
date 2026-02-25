"use client";
import { t } from "@/lib/i18n/t";
import { StateBlock } from "@/app/components/state-block";
import { formatFullDateTime } from "@/lib/shared/date-utils";
import type { WithdrawItem } from "./mantou-types";

export function WithdrawHistory({ withdraws }: { withdraws: WithdrawItem[] }) {
  return (
    <section className="dl-card" style={{ padding: 16, marginTop: 12 }}>
      <div className="text-sm font-semibold text-gray-900">{t("ui.mantou.098")}</div>
      {withdraws.length === 0 ? (
        <div className="mt-3">
          <StateBlock
            tone="empty"
            size="compact"
            title={t("me.mantou.013")}
            description={t("me.mantou.014")}
          />
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          {withdraws.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-100 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">{t("ui.mantou.099")}</span>
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
  );
}
