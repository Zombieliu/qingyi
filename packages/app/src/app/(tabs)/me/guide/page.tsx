"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen, Sparkles, ShieldCheck, MessageCircle } from "lucide-react";

const quickSteps = [
  { title: "1. 完成登录", desc: "使用 Passkey 一键登录，首次登录后完善昵称与联系方式。" },
  { title: "2. 选择服务", desc: "在安排页挑选服务与时间，确认价格与规则。" },
  { title: "3. 提交订单", desc: "确认信息后提交订单，等待接单与确认。" },
  { title: "4. 完成服务", desc: "服务结束后确认完成，可在订单中心查看记录。" },
];

const safetyTips = [
  "保持联系方式真实有效，便于服务沟通。",
  "涉及押金/支付请以平台页面提示为准。",
  "遇到异常订单可在 24 小时内提交工单。",
];

const faqList = [
  { q: "接单失败或超时怎么办？", a: "检查网络与账户状态，必要时提交工单。" },
  { q: "订单状态有哪些？", a: "常见状态：待处理、已确认、进行中、已完成、已取消。" },
  { q: "押金的作用是什么？", a: "用于保障履约与服务质量，完成后按规则结算或退回。" },
];

export default function GuidePage() {
  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/me?settings=1" className="dl-icon-circle" aria-label="返回设置">
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">用户指南</span>
          <span className="dl-chip">新手必看</span>
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
