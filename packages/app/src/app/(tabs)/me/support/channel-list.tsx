"use client";
import { t } from "@/lib/i18n/t";
import { Clock3 } from "lucide-react";
import { channels } from "./support-data";

export function ChannelList() {
  return (
    <section className="dl-card" style={{ padding: 16 }}>
      <div className="text-sm font-semibold text-gray-900">{t("ui.support.080")}</div>
      <div className="mt-3 grid gap-3">
        {channels.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
          >
            <div>
              <div className="text-sm font-semibold text-gray-900">{item.label}</div>
              <div className="text-xs text-gray-500 mt-1">{item.value}</div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock3 size={14} />
              {item.hint}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-xs text-slate-500">
        紧急问题可直接拨打客服电话，其他问题建议提交工单。
      </div>
    </section>
  );
}
