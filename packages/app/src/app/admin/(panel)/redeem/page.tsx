"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { StateBlock } from "@/app/components/state-block";
import { formatFullDateTime } from "@/lib/shared/date-utils";
import type { AdminRedeemBatch, AdminRedeemCode, AdminRedeemRecord } from "@/lib/admin/admin-types";

type RedeemCodeView = AdminRedeemCode & { batch?: AdminRedeemBatch };
type RedeemRecordView = AdminRedeemRecord & { code?: string; batchTitle?: string };

const rewardLabels: Record<string, string> = {
  mantou: "馒头",
  diamond: "钻石",
  vip: "会员时长",
  coupon: "优惠券",
  custom: "自定义",
};

const statusLabels: Record<string, string> = {
  active: "启用",
  disabled: "停用",
  exhausted: "用尽",
  expired: "过期",
  pending: "处理中",
  success: "成功",
  failed: "失败",
};

function formatTime(ts?: number | null) {
  if (!ts) return "-";
  return formatFullDateTime(ts);
}

function formatCode(code: string) {
  if (code.length <= 6) return code;
  return code.replace(/(.{4})/g, "$1 ").trim();
}

export default function RedeemAdminPage() {
  const [codes, setCodes] = useState<RedeemCodeView[]>([]);
  const [records, setRecords] = useState<RedeemRecordView[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createdCodes, setCreatedCodes] = useState<RedeemCodeView[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({
    title: "",
    description: "",
    rewardType: "mantou",
    rewardValue: "",
    rewardDays: "",
    tierId: "",
    couponId: "",
    couponCode: "",
    message: "",
    count: "10",
    prefix: "",
    codeLength: "10",
    maxRedeem: "1",
    maxRedeemPerUser: "1",
    startsAt: "",
    expiresAt: "",
    status: "active",
    codesText: "",
  });

  const buildRewardPayload = useCallback(() => {
    if (form.rewardType === "mantou" || form.rewardType === "diamond") {
      return { amount: Number(form.rewardValue) };
    }
    if (form.rewardType === "vip") {
      return { days: Number(form.rewardDays), tierId: form.tierId.trim() || undefined };
    }
    if (form.rewardType === "coupon") {
      return {
        couponId: form.couponId.trim() || undefined,
        couponCode: form.couponCode.trim() || undefined,
      };
    }
    return { message: form.message.trim() || undefined };
  }, [form]);

  const loadCodes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("pageSize", "50");
      if (query.trim()) params.set("q", query.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/admin/redeem/codes?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "加载失败");
        return;
      }
      setCodes(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setError("加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [query, statusFilter]);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const res = await fetch("/api/admin/redeem/records?pageSize=50");
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRecords(Array.isArray(data?.items) ? data.items : []);
      }
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const createBatch = async () => {
    setError(null);
    if (!form.title.trim()) {
      setError("请输入批次标题");
      return;
    }
    const rewardPayload = buildRewardPayload();
    if (form.rewardType === "mantou" || form.rewardType === "diamond") {
      const amount = Number(form.rewardValue);
      if (!Number.isFinite(amount) || amount <= 0) {
        setError("请输入有效的奖励数量");
        return;
      }
    }
    if (form.rewardType === "vip") {
      const days = Number(form.rewardDays);
      if (!Number.isFinite(days) || days <= 0) {
        setError("请输入有效的会员天数");
        return;
      }
    }
    if (form.rewardType === "coupon") {
      const couponId = form.couponId.trim();
      const couponCode = form.couponCode.trim();
      if (!couponId && !couponCode) {
        setError("请输入优惠券 ID 或兑换码");
        return;
      }
    }

    const codes = form.codesText
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      rewardType: form.rewardType,
      rewardPayload,
      status: form.status,
      maxRedeem: Number(form.maxRedeem) || 1,
      maxRedeemPerUser: Number(form.maxRedeemPerUser) || 1,
      startsAt: form.startsAt || undefined,
      expiresAt: form.expiresAt || undefined,
      count: codes.length ? undefined : Number(form.count) || 1,
      codes: codes.length ? codes : undefined,
      prefix: form.prefix.trim() || undefined,
      codeLength: Number(form.codeLength) || 10,
    };

    try {
      const res = await fetch("/api/admin/redeem/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "创建失败");
        return;
      }
      setCreatedCodes(Array.isArray(data?.codes) ? data.codes : []);
      await loadCodes();
      await loadRecords();
      setForm((prev) => ({ ...prev, title: "", description: "", codesText: "" }));
    } catch {
      setError("创建失败，请稍后再试");
    }
  };

  const patchStatus = async (codeId: string, status: string) => {
    try {
      const res = await fetch(`/api/admin/redeem/codes/${codeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setError("更新失败");
        return;
      }
      await loadCodes();
    } catch {
      setError("更新失败");
    }
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError("复制失败，请稍后再试");
    }
  };

  const createdHint = useMemo(() => {
    if (!createdCodes.length) return null;
    return `已生成 ${createdCodes.length} 个卡密，请及时保存`;
  }, [createdCodes.length]);

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>生成兑换卡密</h3>
            <p>创建批次并生成卡密，支持多种奖励类型。</p>
          </div>
          <div className="admin-card-actions">
            <button className="admin-btn ghost" onClick={loadCodes}>
              <RefreshCw size={14} style={{ marginRight: 4 }} />
              刷新
            </button>
          </div>
        </div>

        {error && (
          <div className="admin-helper" style={{ color: "#ef4444" }}>
            {error}
          </div>
        )}

        <div className="admin-form" style={{ marginTop: 16 }}>
          <label className="admin-field">
            批次标题
            <input
              className="admin-input"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="例如：春节礼包"
            />
          </label>
          <label className="admin-field">
            说明
            <input
              className="admin-input"
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="可选，给运营备注"
            />
          </label>
          <div className="admin-grid-cards">
            <label className="admin-field">
              奖励类型
              <select
                className="admin-select"
                value={form.rewardType}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, rewardType: event.target.value }))
                }
              >
                {Object.entries(rewardLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {(form.rewardType === "mantou" || form.rewardType === "diamond") && (
              <label className="admin-field">
                奖励数量
                <input
                  className="admin-input"
                  value={form.rewardValue}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, rewardValue: event.target.value }))
                  }
                  placeholder="输入数量"
                />
              </label>
            )}
            {form.rewardType === "vip" && (
              <>
                <label className="admin-field">
                  会员天数
                  <input
                    className="admin-input"
                    value={form.rewardDays}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, rewardDays: event.target.value }))
                    }
                    placeholder="输入天数"
                  />
                </label>
                <label className="admin-field">
                  会员等级 ID
                  <input
                    className="admin-input"
                    value={form.tierId}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, tierId: event.target.value }))
                    }
                    placeholder="可选，留空则取默认等级"
                  />
                </label>
              </>
            )}
            {form.rewardType === "coupon" && (
              <>
                <label className="admin-field">
                  优惠券 ID
                  <input
                    className="admin-input"
                    value={form.couponId}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, couponId: event.target.value }))
                    }
                    placeholder="可选"
                  />
                </label>
                <label className="admin-field">
                  优惠券兑换码
                  <input
                    className="admin-input"
                    value={form.couponCode}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, couponCode: event.target.value }))
                    }
                    placeholder="可选"
                  />
                </label>
              </>
            )}
            {form.rewardType === "custom" && (
              <label className="admin-field">
                提示文案
                <input
                  className="admin-input"
                  value={form.message}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, message: event.target.value }))
                  }
                  placeholder="例如：兑换成功"
                />
              </label>
            )}
          </div>

          <div className="admin-grid-cards">
            <label className="admin-field">
              生成数量
              <input
                className="admin-input"
                value={form.count}
                onChange={(event) => setForm((prev) => ({ ...prev, count: event.target.value }))}
                placeholder="默认 10"
              />
            </label>
            <label className="admin-field">
              前缀
              <input
                className="admin-input"
                value={form.prefix}
                onChange={(event) => setForm((prev) => ({ ...prev, prefix: event.target.value }))}
                placeholder="可选，例如 QY"
              />
            </label>
            <label className="admin-field">
              随机长度
              <input
                className="admin-input"
                value={form.codeLength}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, codeLength: event.target.value }))
                }
                placeholder="默认 10"
              />
            </label>
            <label className="admin-field">
              每码可用次数
              <input
                className="admin-input"
                value={form.maxRedeem}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, maxRedeem: event.target.value }))
                }
                placeholder="默认 1"
              />
            </label>
            <label className="admin-field">
              每人可用次数
              <input
                className="admin-input"
                value={form.maxRedeemPerUser}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, maxRedeemPerUser: event.target.value }))
                }
                placeholder="默认 1"
              />
            </label>
            <label className="admin-field">
              状态
              <select
                className="admin-select"
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
              >
                <option value="active">启用</option>
                <option value="disabled">停用</option>
              </select>
            </label>
          </div>

          <div className="admin-grid-cards">
            <label className="admin-field">
              开始日期
              <input
                className="admin-input"
                type="date"
                value={form.startsAt}
                onChange={(event) => setForm((prev) => ({ ...prev, startsAt: event.target.value }))}
              />
            </label>
            <label className="admin-field">
              结束日期
              <input
                className="admin-input"
                type="date"
                value={form.expiresAt}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, expiresAt: event.target.value }))
                }
              />
            </label>
          </div>

          <label className="admin-field">
            自定义卡密（可选，粘贴则覆盖生成数量）
            <textarea
              className="admin-textarea"
              value={form.codesText}
              onChange={(event) => setForm((prev) => ({ ...prev, codesText: event.target.value }))}
              placeholder="每行一个卡密或使用空格分隔"
            />
          </label>

          <div className="admin-card-actions">
            <button className="admin-btn" onClick={createBatch}>
              生成卡密
            </button>
            {createdHint && <span className="admin-helper">{createdHint}</span>}
          </div>
        </div>
      </div>

      {createdCodes.length > 0 && (
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>最新生成卡密</h3>
              <p>点击即可复制卡密。</p>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>卡密</th>
                  <th>状态</th>
                  <th>次数</th>
                  <th>奖励</th>
                </tr>
              </thead>
              <tbody>
                {createdCodes.map((code) => {
                  const rewardType = code.rewardType || code.batch?.rewardType || "custom";
                  const payload = (code.rewardPayload || code.batch?.rewardPayload || {}) as Record<
                    string,
                    unknown
                  >;
                  const summary = (() => {
                    if (rewardType === "mantou" || rewardType === "diamond") {
                      const amount = payload.amount;
                      return typeof amount === "number" || typeof amount === "string"
                        ? `${amount}`
                        : "-";
                    }
                    if (rewardType === "vip") {
                      const days = payload.days;
                      const value =
                        typeof days === "number" || typeof days === "string" ? `${days}` : "-";
                      return `${value} 天`;
                    }
                    if (rewardType === "coupon") {
                      const couponId = payload.couponId;
                      const couponCode = payload.couponCode;
                      if (typeof couponId === "string" && couponId) return couponId;
                      if (typeof couponCode === "string" && couponCode) return couponCode;
                      return "-";
                    }
                    const message = payload.message;
                    return typeof message === "string" && message ? message : "-";
                  })();
                  return (
                    <tr key={code.id}>
                      <td>
                        <button className="admin-btn ghost" onClick={() => copyText(code.code)}>
                          <Copy size={14} style={{ marginRight: 6 }} />
                          {formatCode(code.code)}
                        </button>
                      </td>
                      <td>{statusLabels[code.status] || code.status}</td>
                      <td>
                        {code.usedCount}/{code.maxRedeem}
                      </td>
                      <td>
                        {rewardLabels[rewardType] || rewardType} · {summary}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>卡密列表</h3>
            <p>查看卡密状态与使用情况。</p>
          </div>
        </div>

        <div className="admin-card-actions" style={{ marginTop: 12 }}>
          <input
            className="admin-input"
            style={{ maxWidth: 240 }}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索卡密或批次"
          />
          <select
            className="admin-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">全部状态</option>
            <option value="active">启用</option>
            <option value="disabled">停用</option>
            <option value="exhausted">用尽</option>
            <option value="expired">过期</option>
          </select>
          <button className="admin-btn ghost" onClick={loadCodes}>
            刷新
          </button>
        </div>

        {loading ? (
          <StateBlock tone="loading" size="compact" title="加载中" />
        ) : codes.length === 0 ? (
          <StateBlock tone="empty" size="compact" title="暂无卡密" />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>卡密</th>
                  <th>批次</th>
                  <th>状态</th>
                  <th>次数</th>
                  <th>奖励</th>
                  <th>有效期</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => {
                  const rewardType = code.rewardType || code.batch?.rewardType || "custom";
                  const payload = (code.rewardPayload || code.batch?.rewardPayload || {}) as Record<
                    string,
                    unknown
                  >;
                  const summary = (() => {
                    if (rewardType === "mantou" || rewardType === "diamond") {
                      const amount = payload.amount;
                      return typeof amount === "number" || typeof amount === "string"
                        ? `${amount}`
                        : "-";
                    }
                    if (rewardType === "vip") {
                      const days = payload.days;
                      const value =
                        typeof days === "number" || typeof days === "string" ? `${days}` : "-";
                      return `${value} 天`;
                    }
                    if (rewardType === "coupon") {
                      const couponId = payload.couponId;
                      const couponCode = payload.couponCode;
                      if (typeof couponId === "string" && couponId) return couponId;
                      if (typeof couponCode === "string" && couponCode) return couponCode;
                      return "-";
                    }
                    const message = payload.message;
                    return typeof message === "string" && message ? message : "-";
                  })();
                  return (
                    <tr key={code.id}>
                      <td>{formatCode(code.code)}</td>
                      <td>
                        <div className="admin-text-strong">{code.batch?.title || "-"}</div>
                        <div className="admin-meta-faint">
                          {code.batch?.id || code.batchId || "-"}
                        </div>
                      </td>
                      <td>{statusLabels[code.status] || code.status}</td>
                      <td>
                        {code.usedCount}/{code.maxRedeem}
                      </td>
                      <td>
                        {rewardLabels[rewardType] || rewardType} · {summary}
                      </td>
                      <td>
                        {code.startsAt ? formatTime(code.startsAt) : "不限"} ~{" "}
                        {code.expiresAt ? formatTime(code.expiresAt) : "不限"}
                      </td>
                      <td>
                        {code.status === "active" ? (
                          <button
                            className="admin-btn ghost"
                            onClick={() => patchStatus(code.id, "disabled")}
                          >
                            停用
                          </button>
                        ) : code.status === "disabled" ? (
                          <button
                            className="admin-btn ghost"
                            onClick={() => patchStatus(code.id, "active")}
                          >
                            启用
                          </button>
                        ) : (
                          <span className="admin-meta">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>兑换记录</h3>
            <p>最新 50 条兑换记录。</p>
          </div>
        </div>
        {recordsLoading ? (
          <StateBlock tone="loading" size="compact" title="加载中" />
        ) : records.length === 0 ? (
          <StateBlock tone="empty" size="compact" title="暂无兑换记录" />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>用户</th>
                  <th>卡密</th>
                  <th>批次</th>
                  <th>奖励</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>{formatTime(record.createdAt)}</td>
                    <td>{record.userAddress}</td>
                    <td>{record.code ? formatCode(record.code) : record.codeId}</td>
                    <td>{record.batchTitle || record.batchId || "-"}</td>
                    <td>{rewardLabels[record.rewardType] || record.rewardType}</td>
                    <td>{statusLabels[record.status] || record.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
