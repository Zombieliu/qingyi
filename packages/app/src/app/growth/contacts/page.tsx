"use client";

import { useEffect, useState } from "react";

type Contact = {
  id: string;
  name: string | null;
  userAddress: string | null;
  phone: string | null;
  source: string | null;
  lifecycle: string;
  score: number;
  tags: string[];
  totalOrders: number;
  totalSpent: number;
  lastSeenAt: string;
  assignedTo: string | null;
};

const LIFECYCLE_COLORS: Record<string, string> = {
  stranger: "bg-gray-100 text-gray-600",
  visitor: "bg-blue-50 text-blue-600",
  lead: "bg-amber-50 text-amber-600",
  customer: "bg-emerald-50 text-emerald-600",
  promoter: "bg-purple-50 text-purple-600",
};

const LIFECYCLE_OPTIONS = ["", "stranger", "visitor", "lead", "customer", "promoter"];

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lifecycle, setLifecycle] = useState("");
  const [page, setPage] = useState(0);
  const limit = 30;

  const fetchContacts = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (lifecycle) params.set("lifecycle", lifecycle);
    params.set("limit", String(limit));
    params.set("offset", String(page * limit));

    fetch(`/api/growth/contacts?${params}`, {
      headers: {
        Authorization: `Bearer ${document.cookie.match(/admin_session=([^;]+)/)?.[1] || ""}`,
      },
    })
      .then((r) => r.json())
      .then((d) => {
        setContacts(d.items || []);
        setTotal(d.total || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchContacts();
  }, [lifecycle, page]);

  const formatTime = (t: string) => {
    const d = new Date(t);
    // eslint-disable-next-line react-hooks/purity -- Date.now() needed for relative time
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return `${Math.floor(diff / 86400000)}天前`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">用户池</h1>
          <p className="text-sm text-gray-500">共 {total} 个用户</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <input
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm w-64"
          placeholder="搜索姓名、手机、地址..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchContacts()}
        />
        <select
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          value={lifecycle}
          onChange={(e) => {
            setLifecycle(e.target.value);
            setPage(0);
          }}
        >
          <option value="">全部阶段</option>
          {LIFECYCLE_OPTIONS.filter(Boolean).map((lc) => (
            <option key={lc} value={lc}>
              {lc}
            </option>
          ))}
        </select>
        <button className="text-sm text-blue-600 hover:text-blue-800" onClick={fetchContacts}>
          搜索
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-400">加载中...</div>
        ) : contacts.length === 0 ? (
          <div className="py-12 text-center text-gray-400">暂无用户数据</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
                <th className="px-4 py-2.5 font-medium">用户</th>
                <th className="px-4 py-2.5 font-medium">来源</th>
                <th className="px-4 py-2.5 font-medium">阶段</th>
                <th className="px-4 py-2.5 font-medium text-right">评分</th>
                <th className="px-4 py-2.5 font-medium text-right">订单</th>
                <th className="px-4 py-2.5 font-medium text-right">消费</th>
                <th className="px-4 py-2.5 font-medium">最近活跃</th>
                <th className="px-4 py-2.5 font-medium">负责人</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                  onClick={() => (window.location.href = `/growth/contacts/${c.id}`)}
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900">{c.name || "匿名"}</div>
                    <div className="text-[10px] text-gray-400 truncate max-w-[160px]">
                      {c.userAddress || c.phone || "-"}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{c.source || "-"}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${LIFECYCLE_COLORS[c.lifecycle] || "bg-gray-100"}`}
                    >
                      {c.lifecycle}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">{c.score}</td>
                  <td className="px-4 py-2.5 text-right">{c.totalOrders}</td>
                  <td className="px-4 py-2.5 text-right text-emerald-600">
                    ¥{c.totalSpent.toFixed(0)}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{formatTime(c.lastSeenAt)}</td>
                  <td className="px-4 py-2.5 text-gray-500">{c.assignedTo || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex justify-center gap-2">
          <button
            className="px-3 py-1 text-sm rounded border disabled:opacity-30"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            上一页
          </button>
          <span className="px-3 py-1 text-sm text-gray-500">
            {page + 1} / {Math.ceil(total / limit)}
          </span>
          <button
            className="px-3 py-1 text-sm rounded border disabled:opacity-30"
            disabled={(page + 1) * limit >= total}
            onClick={() => setPage(page + 1)}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
