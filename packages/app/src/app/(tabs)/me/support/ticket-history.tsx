"use client";
import { t } from "@/lib/i18n/t";
import { MessageCircle } from "lucide-react";
import { StateBlock } from "@/app/components/state-block";
import { formatFullDateTime } from "@/lib/shared/date-utils";
import type { SupportRequest } from "./support-data";

export function TicketHistory({ requests }: { requests: SupportRequest[] }) {
  return (
    <section className="dl-card" style={{ padding: 16 }}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">{t("ui.support.087")}</div>
        <MessageCircle size={16} className="text-slate-500" />
      </div>
      {requests.length === 0 ? (
        <div className="mt-3">
          <StateBlock
            tone="empty"
            size="compact"
            title={t("me.support.006")}
            description={t("me.support.007")}
          />
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          {requests.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">{item.topic}</div>
                <span className="text-xs text-emerald-600">{item.status}</span>
              </div>
              <div className="text-xs text-slate-500 mt-2">{item.message}</div>
              {item.reply && (
                <div className="mt-2 rounded-xl bg-blue-50 px-3 py-2">
                  <div className="text-[11px] text-blue-600 font-semibold">
                    {t("me.support.013")}
                  </div>
                  <div className="text-xs text-blue-800 mt-1">{item.reply}</div>
                </div>
              )}
              <div className="text-[11px] text-slate-400 mt-2">
                {formatFullDateTime(item.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
