"use client";
import { t } from "@/lib/i18n/i18n-client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search, Save } from "lucide-react";
import { StateBlock } from "@/app/components/state-block";
import { formatShortDateTime } from "@/lib/shared/date-utils";

type ReferralItem = {
  id: string;
  inviterAddress: string;
  inviteeAddress: string;
  status: string;
  rewardInviter?: number;
  rewardInvitee?: number;
  createdAt: number;
  rewardedAt?: number;
};

type ReferralConfig = {
  enabled: boolean;
  mode: "fixed" | "percent";
  inviterReward: number;
  inviteeReward: number;
  percentBps: number;
};

export default function AdminReferralPage() {
  const [config, setConfig] = useState<ReferralConfig>({
    enabled: true,
    mode: "fixed",
    inviterReward: 5,
    inviteeReward: 3,
    percentBps: 500,
  });
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);

  const [referrals, setReferrals] = useState<ReferralItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(t("admin.referral.001"));
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState<string | null>(null);
  const [prevCursors, setPrevCursors] = useState<Array<string | null>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const pageSize = 20;

  useEffect(() => {
    setConfigLoading(true);
    fetch("/api/admin/referral/config")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data) setConfig(data);
        }
      })
      .catch(() => {})
      .finally(() => setConfigLoading(false));
  }, []);

  const saveConfig = async () => {
    setConfigSaving(true);
    try {
      await fetch("/api/admin/referral/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
    } finally {
      setConfigSaving(false);
    }
  };

  const loadList = useCallback(
    async (cursorValue: string | null, nextPage: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("pageSize", String(pageSize));
        if (cursorValue) params.set("cursor", cursorValue);
        if (statusFilter && statusFilter !== "全部") params.set("status", statusFilter);
        if (query.trim()) params.set("q", query.trim());
        const res = await fetch(`/api/admin/referral/list?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setReferrals(Array.isArray(data?.items) ? data.items : []);
          setPage(nextPage);
          setNextCursor(data?.nextCursor || null);
        }
      } finally {
        setLoading(false);
      }
    },
    [query, statusFilter]
  );

  useEffect(() => {
    setPrevCursors([]);
    setCursor(null);
    setPage(1);
  }, [query, statusFilter]);

  useEffect(() => {
    loadList(cursor, page);
  }, [loadList, cursor, page]);

  const goPrev = () => {
    setPrevCursors((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      setCursor(prev[prev.length - 1] ?? null);
      setPage((v) => Math.max(1, v - 1));
      return next;
    });
  };

  const goNext = () => {
    if (!nextCursor) return;
    setPrevCursors((prev) => [...prev, cursor]);
    setCursor(nextCursor);
    setPage((v) => v + 1);
  };

  function shortAddr(addr: string) {
    if (!addr || addr.length < 12) return addr;
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>返利配置</h3>
            <p>设置邀请返利的模式与奖励金额。</p>
          </div>
        </div>
        {configLoading ? (
          <StateBlock tone="loading" size="compact" title={t("admin.referral.002")} />
        ) : (
          <>
            <div
              className="admin-form"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
            >
              <label className="admin-field">
                启用返利
                <select
                  className="admin-select"
                  value={config.enabled ? "是" : t("admin.referral.003")}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, enabled: e.target.value === "是" }))
                  }
                >
                  <option value={t("admin.referral.004")}>启用</option>
                  <option value={t("admin.referral.005")}>停用</option>
                </select>
              </label>
              <label className="admin-field">
                奖励模式
                <select
                  className="admin-select"
                  value={config.mode}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, mode: e.target.value as "fixed" | "percent" }))
                  }
                >
                  <option value="fixed">固定金额</option>
                  <option value="percent">按比例</option>
                </select>
              </label>
              {config.mode === "fixed" ? (
                <>
                  <label className="admin-field">
                    邀请人奖励（馒头）
                    <input
                      className="admin-input"
                      type="number"
                      value={config.inviterReward}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, inviterReward: Number(e.target.value) }))
                      }
                    />
                  </label>
                  <label className="admin-field">
                    被邀请人奖励（馒头）
                    <input
                      className="admin-input"
                      type="number"
                      value={config.inviteeReward}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, inviteeReward: Number(e.target.value) }))
                      }
                    />
                  </label>
                </>
              ) : (
                <label className="admin-field">
                  返利比例（BPS，1% = 100）
                  <input
                    className="admin-input"
                    type="number"
                    value={config.percentBps}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, percentBps: Number(e.target.value) }))
                    }
                  />
                </label>
              )}
            </div>
            <button className="admin-btn primary" onClick={saveConfig} style={{ marginTop: 14 }}>
              <Save size={16} style={{ marginRight: 6 }} />
              {configSaving ? "保存中..." : t("admin.referral.006")}
            </button>
          </>
        )}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>邀请记录</h3>
            <p>查看所有邀请关系与返利状态。</p>
          </div>
        </div>
        <div className="admin-toolbar">
          <div className="admin-toolbar-grow" style={{ position: "relative" }}>
            <Search size={16} className="admin-input-icon" />
            <input
              className="admin-input"
              style={{ paddingLeft: 36 }}
              placeholder={t("admin.referral.007")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="admin-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value={t("admin.referral.008")}>全部状态</option>
            <option value="pending">待返利</option>
            <option value="rewarded">已返利</option>
          </select>
          <button
            className="admin-btn ghost"
            onClick={() => {
              setPrevCursors([]);
              setCursor(null);
              setPage(1);
            }}
          >
            <RefreshCw size={16} style={{ marginRight: 6 }} />
            刷新
          </button>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>邀请列表</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">共 {referrals.length} 条</span>
          </div>
        </div>
        {loading ? (
          <StateBlock tone="loading" size="compact" title={t("admin.referral.009")} />
        ) : referrals.length === 0 ? (
          <StateBlock
            tone="empty"
            size="compact"
            title={t("admin.referral.010")}
            description={t("admin.referral.011")}
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>邀请人</th>
                  <th>被邀请人</th>
                  <th>状态</th>
                  <th>邀请人奖励</th>
                  <th>被邀请人奖励</th>
                  <th>邀请时间</th>
                  <th>返利时间</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.id}>
                    <td data-label={t("admin.referral.012")}>{shortAddr(r.inviterAddress)}</td>
                    <td data-label={t("admin.referral.013")}>{shortAddr(r.inviteeAddress)}</td>
                    <td data-label={t("admin.referral.014")}>
                      <span
                        className={`admin-badge ${r.status === "rewarded" ? "success" : "neutral"}`}
                      >
                        {r.status === "rewarded" ? "已返利" : t("admin.referral.015")}
                      </span>
                    </td>
                    <td data-label={t("admin.referral.016")}>{r.rewardInviter ?? "—"}</td>
                    <td data-label={t("admin.referral.017")}>{r.rewardInvitee ?? "—"}</td>
                    <td data-label={t("admin.referral.018")}>{formatShortDateTime(r.createdAt)}</td>
                    <td data-label={t("admin.referral.019")}>
                      {r.rewardedAt ? formatShortDateTime(r.rewardedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="admin-pagination">
          <button className="admin-btn ghost" disabled={prevCursors.length === 0} onClick={goPrev}>
            上一页
          </button>
          <div className="admin-meta">第 {page} 页</div>
          <button className="admin-btn ghost" disabled={!nextCursor} onClick={goNext}>
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
