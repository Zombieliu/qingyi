"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

type AnalyticsSummary = {
  rangeDays: number;
  totalEvents: number;
  events: Array<{ event: string; count: number; unique: number }>;
  funnel: Array<{ step: string; unique: number; conversionFromPrev: number }>;
  topPaths: Array<{ path: string; count: number }>;
};

const RANGE_OPTIONS = [7, 14, 30];

export default function AnalyticsPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (range: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics?days=${range}`);
      if (res.ok) {
        const payload = (await res.json()) as AnalyticsSummary;
        setData(payload);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(days);
  }, [days]);

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>增长概览</h3>
            <p>查看最近周期内的访问与转化表现。</p>
          </div>
          <div className="admin-card-actions">
            {RANGE_OPTIONS.map((range) => (
              <button
                key={range}
                className={`admin-btn ${days === range ? "primary" : "ghost"}`}
                onClick={() => setDays(range)}
              >
                近{range}天
              </button>
            ))}
            <button className="admin-btn ghost" onClick={() => load(days)}>
              <RefreshCw size={16} style={{ marginRight: 6 }} />
              刷新
            </button>
          </div>
        </div>
        {loading ? (
          <p>加载中...</p>
        ) : data ? (
          <div className="admin-grid-cards" style={{ marginTop: 6 }}>
            <div className="admin-card admin-card--subtle">
              <h3>事件总量</h3>
              <div className="admin-stat">{data.totalEvents}</div>
              <p>最近 {data.rangeDays} 天事件记录</p>
            </div>
            <div className="admin-card admin-card--subtle">
              <h3>访问次数</h3>
              <div className="admin-stat">
                {data.events.find((item) => item.event === "page_view")?.count || 0}
              </div>
              <p>页面曝光总次数</p>
            </div>
            <div className="admin-card admin-card--subtle">
              <h3>下单意向</h3>
              <div className="admin-stat">
                {data.events.find((item) => item.event === "order_intent")?.unique || 0}
              </div>
              <p>触发下单意向的用户</p>
            </div>
            <div className="admin-card admin-card--subtle">
              <h3>下单成功</h3>
              <div className="admin-stat">
                {data.events.find((item) => item.event === "order_create_success")?.unique || 0}
              </div>
              <p>完成下单的用户</p>
            </div>
          </div>
        ) : (
          <p>暂无数据</p>
        )}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>转化漏斗</h3>
        </div>
        {loading ? (
          <p>加载中...</p>
        ) : data ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>步骤</th>
                  <th>触达人数</th>
                  <th>转化率</th>
                </tr>
              </thead>
              <tbody>
                {data.funnel.map((step) => (
                  <tr key={step.step}>
                    <td data-label="步骤" className="admin-text-strong">
                      {step.step}
                    </td>
                    <td data-label="触达人数">{step.unique}</td>
                    <td data-label="转化率">{(step.conversionFromPrev * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>暂无数据</p>
        )}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>事件分布</h3>
        </div>
        {loading ? (
          <p>加载中...</p>
        ) : data ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>事件</th>
                  <th>总量</th>
                  <th>独立人数</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((item) => (
                  <tr key={item.event}>
                    <td data-label="事件" className="admin-text-strong">
                      {item.event}
                    </td>
                    <td data-label="总量">{item.count}</td>
                    <td data-label="独立人数">{item.unique}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>暂无数据</p>
        )}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>热门页面</h3>
        </div>
        {loading ? (
          <p>加载中...</p>
        ) : data ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>页面</th>
                  <th>访问次数</th>
                </tr>
              </thead>
              <tbody>
                {data.topPaths.map((item) => (
                  <tr key={item.path}>
                    <td data-label="页面" className="admin-text-strong">
                      {item.path}
                    </td>
                    <td data-label="访问次数">{item.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>暂无数据</p>
        )}
      </div>
    </div>
  );
}
