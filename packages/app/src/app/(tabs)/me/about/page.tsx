"use client";
import { t } from "@/lib/i18n/i18n-client";

import Link from "next/link";
import { ArrowLeft, Info, ShieldCheck, Phone, Mail, Globe2 } from "lucide-react";

const serviceHighlights = [
  "跨平台陪玩调度与服务撮合",
  "高素质队友与教练匹配",
  "订单进度与履约流程透明可追踪",
];

const contactList = [
  { label: "客服热线", value: "400-882-1001", icon: Phone },
  { label: t("ui.about.558"), value: "support@qingyi.gg", icon: Mail },
  { label: "在线工单", value: "进入工单中心提交", icon: Globe2, href: "/me/support" },
];

export default function AboutPage() {
  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/me?settings=1" className="dl-icon-circle" aria-label={t("me.about.001")}>
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">{t("ui.about.069")}</span>
          <span className="dl-chip">{t("ui.about.070")}</span>
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <Info size={16} />
          </span>
        </div>
      </header>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Info size={16} />
          平台介绍
        </div>
        <div className="mt-3 text-xs text-slate-500 leading-relaxed">
          情谊电竞提供高质量陪玩服务与游戏社交体验，聚焦匹配效率、服务体验与订单安全，帮助用户在更短时间内找到合适的队友或教练。
        </div>
        <div className="mt-3 grid gap-2 text-xs text-slate-500">
          {serviceHighlights.map((item) => (
            <div key={item} className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-slate-400" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <ShieldCheck size={16} />
          服务与保障
        </div>
        <div className="mt-3 text-xs text-slate-500 leading-relaxed">
          平台强调履约透明与服务规范，订单状态、支付与售后流程均可追踪。如遇异常情况，可随时提交工单，我们将尽快处理。
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/faq" className="dl-tab-btn">
            查看 FAQ
          </Link>
          <Link href="/me/support" className="dl-tab-btn">
            进入工单中心
          </Link>
        </div>
      </section>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Phone size={16} />
          联系方式
        </div>
        <div className="mt-3 grid gap-3">
          {contactList.map((item) => {
            const Icon = item.icon;
            const content = (
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Icon size={14} />
                    {item.label}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{item.value}</div>
                </div>
                {item.href ? (
                  <span className="text-xs text-emerald-600">{t("ui.about.071")}</span>
                ) : null}
              </div>
            );

            if (item.href) {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
                >
                  {content}
                </Link>
              );
            }

            return (
              <div
                key={item.label}
                className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
              >
                {content}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
