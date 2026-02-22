"use client";
import { t } from "@/lib/i18n/i18n-client";

import Link from "next/link";
import { ArrowLeft, BookOpen, Sparkles, ShieldCheck, MessageCircle } from "lucide-react";

const quickSteps = [
  { title: t("tabs.me.guide.i032"), desc: t("tabs.me.guide.i033") },
  { title: t("tabs.me.guide.i034"), desc: t("tabs.me.guide.i035") },
  { title: t("tabs.me.guide.i036"), desc: t("tabs.me.guide.i037") },
  { title: t("tabs.me.guide.i038"), desc: t("tabs.me.guide.i039") },
];

const safetyTips = [t("tabs.me.guide.i040"), t("tabs.me.guide.i041"), t("tabs.me.guide.i042")];

const faqList = [
  { q: t("ui.guide.604"), a: t("tabs.me.guide.i043") },
  { q: t("ui.guide.664"), a: t("tabs.me.guide.i044") },
  { q: t("ui.guide.603"), a: t("tabs.me.guide.i045") },
];

export default function GuidePage() {
  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/me?settings=1" className="dl-icon-circle" aria-label={t("me.guide.001")}>
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">{t("ui.guide.053")}</span>
          <span className="dl-chip">{t("ui.guide.054")}</span>
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <BookOpen size={16} />
          </span>
        </div>
      </header>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Sparkles size={16} />
          快速开始
        </div>
        <div className="mt-3 grid gap-3">
          {quickSteps.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
            >
              <div className="text-sm font-semibold text-gray-900">{item.title}</div>
              <div className="text-xs text-slate-500 mt-1">{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <ShieldCheck size={16} />
          安全与服务提示
        </div>
        <div className="mt-3 grid gap-2 text-xs text-slate-500">
          {safetyTips.map((tip) => (
            <div key={tip} className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-slate-400" />
              <span>{tip}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <MessageCircle size={16} />
          常见问题
        </div>
        <div className="mt-3 grid gap-3">
          {faqList.map((item) => (
            <div key={item.q} className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
              <div className="text-sm font-semibold text-gray-900">{item.q}</div>
              <div className="text-xs text-slate-500 mt-1">{item.a}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/faq" className="dl-tab-btn">
            查看完整 FAQ
          </Link>
          <Link href="/me/support" className="dl-tab-btn">
            提交工单
          </Link>
        </div>
      </section>
    </div>
  );
}
