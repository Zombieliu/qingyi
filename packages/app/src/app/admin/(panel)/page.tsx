"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Megaphone, Users, Zap } from "lucide-react";
import type { AdminOrder, AdminPlayer } from "@/lib/admin-types";

interface AdminStats {
  totalOrders: number;
  pendingOrders: number;
  activePlayers: number;
  publishedAnnouncements: number;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats>({
    totalOrders: 0,
    pendingOrders: 0,
    activePlayers: 0,
    publishedAnnouncements: 0,
  });
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, ordersRes, playersRes] = await Promise.all([
          fetch("/api/admin/stats"),
          fetch("/api/admin/orders"),
          fetch("/api/admin/players"),
        ]);
        if (statsRes.ok) {
          const data = await statsRes.json();
          setStats(data);
        }
        if (ordersRes.ok) {
          const data = await ordersRes.json();
          setOrders(Array.isArray(data) ? data : []);
        }
        if (playersRes.ok) {
          const data = await playersRes.json();
          setPlayers(Array.isArray(data) ? data : []);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const recentOrders = useMemo(() => orders.slice(0, 5), [orders]);
  const activePlayers = useMemo(() => players.slice(0, 5), [players]);

  return (
    <div>
      <div className="admin-grid-cards">
        <div className="admin-card">
          <h3>订单总量</h3>
          <div className="admin-stat">{stats.totalOrders}</div>
          <p>本地订单池累计数量</p>
        </div>
        <div className="admin-card">
          <h3>待处理订单</h3>
          <div className="admin-stat">{stats.pendingOrders}</div>
          <p>未完成/未取消订单</p>
        </div>
        <div className="admin-card">
          <h3>可用打手</h3>
          <div className="admin-stat">{stats.activePlayers}</div>
          <p>可接单或忙碌状态</p>
        </div>
        <div className="admin-card">
          <h3>已发布公告</h3>
          <div className="admin-stat">{stats.publishedAnnouncements}</div>
          <p>当前面向用户的资讯</p>
        </div>
      </div>

      <div className="admin-section" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div className="admin-card">
          <h3>待处理订单</h3>
          {loading ? (
            <p>正在加载...</p>
          ) : recentOrders.length === 0 ? (
            <p>暂无订单记录</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>订单</th>
                  <th>状态</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{order.user}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{order.item}</div>
                    </td>
                    <td>
                      <span className="admin-badge">
                        {order.stage}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{formatTime(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Link href="/admin/orders" className="admin-btn ghost" style={{ marginTop: 12, display: "inline-flex" }}>
            <ClipboardList size={16} style={{ marginRight: 6 }} />
            查看全部订单
          </Link>
        </div>

        <div className="admin-card">
          <h3>打手状态</h3>
          {loading ? (
            <p>正在加载...</p>
          ) : activePlayers.length === 0 ? (
            <p>暂无打手档案</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>名字</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {activePlayers.map((player) => (
                  <tr key={player.id}>
                    <td>{player.name}</td>
                    <td>
                      <span className="admin-badge neutral">{player.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Link href="/admin/players" className="admin-btn ghost" style={{ marginTop: 12, display: "inline-flex" }}>
            <Users size={16} style={{ marginRight: 6 }} />
            管理打手资料
          </Link>
        </div>

        <div className="admin-card">
          <h3>快速入口</h3>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <Link href="/admin/orders" className="admin-chip">
              <Zap size={14} />
              订单分配与状态更新
            </Link>
            <Link href="/admin/announcements" className="admin-chip">
              <Megaphone size={14} />
              发布公告与资讯
            </Link>
            <Link href="/admin/ledger" className="admin-chip">
              <ClipboardList size={14} />
              链上记账登记
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
