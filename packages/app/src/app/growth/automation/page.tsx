"use client";

import { useState } from "react";

type Automation = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  trigger: Record<string, unknown>;
  action: Record<string, unknown>;
  executedCount: number;
  lastExecutedAt: string | null;
};

export default function AutomationPage() {
  const [rules] = useState<Automation[]>([]);

  // TODO: fetch from /api/growth/automation when ready

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">自动化规则</h1>
          <p className="text-sm text-gray-500">设置触发条件和自动动作，提升运营效率</p>
        </div>
        <button className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800">
          + 新建规则
        </button>
      </div>

      {/* Preset Templates */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">推荐规则模板</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <RuleTemplate
            icon="🎯"
            name="高意向线索自动分配"
            desc="访问 ≥3 次且浏览定价页的用户，自动分配给运营跟进"
            trigger="visit_count >= 3 AND visited /pricing"
            action="assign to ops"
          />
          <RuleTemplate
            icon="⚡"
            name="首单未完成提醒"
            desc="注册 24h 内未下单的用户，自动标记为待跟进"
            trigger="registered AND no_order_in_24h"
            action="tag: needs_followup"
          />
          <RuleTemplate
            icon="🔥"
            name="高消费用户升级"
            desc="累计消费 ≥500 的用户，自动升级为 promoter"
            trigger="total_spent >= 500"
            action="lifecycle: promoter"
          />
          <RuleTemplate
            icon="📉"
            name="低效渠道告警"
            desc="渠道 7 天转化率 <1%，自动发送告警"
            trigger="channel_conversion_rate < 1% in 7d"
            action="alert: low_conversion"
          />
        </div>
      </div>

      {/* Active Rules */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">已配置规则</h2>
        {rules.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">
            暂无自动化规则，从上方模板开始或自定义创建
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <div className="text-sm font-medium">{r.name}</div>
                  <div className="text-xs text-gray-400">{r.description}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">执行 {r.executedCount} 次</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] ${r.active ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}
                  >
                    {r.active ? "启用" : "停用"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RuleTemplate({
  icon,
  name,
  desc,
  trigger,
  action,
}: {
  icon: string;
  name: string;
  desc: string;
  trigger: string;
  action: string;
}) {
  return (
    <div className="p-3 rounded-lg border border-dashed border-gray-200 hover:border-gray-400 cursor-pointer transition">
      <div className="flex items-center gap-2 mb-1">
        <span>{icon}</span>
        <span className="text-sm font-medium text-gray-900">{name}</span>
      </div>
      <div className="text-xs text-gray-500 mb-2">{desc}</div>
      <div className="flex gap-2 text-[10px]">
        <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded">IF: {trigger}</span>
        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">THEN: {action}</span>
      </div>
    </div>
  );
}
