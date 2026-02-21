"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Megaphone, Users, Zap } from "lucide-react";
import type { AdminOrder, AdminPlayer } from "@/lib/admin/admin-types";
import { readCache, writeCache } from "@/lib/shared/client-cache";
import { formatShortDateTime } from "@/lib/shared/date-utils";
import { StateBlock } from "@/app/components/state-block";

interface AdminStats {
  totalOrders: number;
  pendingOrders: number;
  activePlayers: number;
  publishedAnnouncements: number;
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
  const cacheTtlMs = 60_000;

  useEffect(() => {
    const load = async () => {
      const statsCacheKey = "cache:admin:stats";
      const ordersCacheKey = "cache:admin:orders:recent";
      const playersCacheKey = "cache:admin:players:recent";
      const cachedStats = readCache<AdminStats>(statsCacheKey, cacheTtlMs, true);
      if (cachedStats) {
        setStats(cachedStats.value);
      }
      const cachedOrders = readCache<AdminOrder[]>(ordersCacheKey, cacheTtlMs, true);
      if (cachedOrders) {
        setOrders(Array.isArray(cachedOrders.value) ? cachedOrders.value : []);
      }
      const cachedPlayers = readCache<AdminPlayer[]>(playersCacheKey, cacheTtlMs, true);
      if (cachedPlayers) {
        setPlayers(Array.isArray(cachedPlayers.value) ? cachedPlayers.value : []);
      }
      try {
        const [statsRes, ordersRes, playersRes] = await Promise.all([
          fetch("/api/admin/stats"),
          fetch("/api/admin/orders"),
          fetch("/api/admin/players"),
        ]);
        if (statsRes.ok) {
          const data = await statsRes.json();
          setStats(data);
          writeCache(statsCacheKey, data);
        }
        if (ordersRes.ok) {
          const data = await ordersRes.json();
          const next = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
          setOrders(next);
          writeCache(ordersCacheKey, next);
        }
        if (playersRes.ok) {
          const data = await playersRes.json();
          const next = Array.isArray(data) ? data : [];
          setPlayers(next);
          writeCache(playersCacheKey, next);
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
      <div className="admin-grid-cards motion-stack">
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>订单总量</h3>
          </div>
          <div className="admin-stat">{stats.totalOrders}</div>
          <p>本地订单池累计数量</p>
        </div>
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>待处理订单</h3>
          </div>
          <div className="admin-stat">{stats.pendingOrders}</div>
          <p>未完成/未取消订单</p>
        </div>
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>可用陪练</h3>
          </div>
          <div className="admin-stat">{stats.activePlayers}</div>
          <p>可接单或忙碌状态</p>
        </div>
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>已发布公告</h3>
          </div>
          <div className="admin-stat">{stats.publishedAnnouncements}</div>
          <p>当前面向用户的资讯</p>
        </div>
      </div>

      <div
        className="admin-section motion-stack"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
      >
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>待处理订单</h3>
            <div className="admin-card-actions">
              <Link href="/admin/orders" className="admin-btn ghost">
                <ClipboardList size={16} style={{ marginRight: 6 }} />
                查看全部订单
              </Link>
            </div>
          </div>
          {loading ? (
            <StateBlock
              tone="loading"
              size="compact"
              title="正在加载"
              description="同步最新订单数据"
            />
          ) : recentOrders.length === 0 ? (
            <StateBlock
              tone="empty"
              size="compact"
              title="暂无订单记录"
              description="稍后再来查看"
            />
          ) : (
            <div className="admin-table-wrap">
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
                      <td data-label="订单">
                        <div className="admin-text-strong">{order.user}</div>
                        <div className="admin-meta">{order.item}</div>
                      </td>
                      <td data-label="状态">
                        <span className="admin-badge">{order.stage}</span>
                      </td>
                      <td data-label="时间" className="admin-meta">
                        {formatShortDateTime(order.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <h3>陪练状态</h3>
            <div className="admin-card-actions">
              <Link href="/admin/players" className="admin-btn ghost">
                <Users size={16} style={{ marginRight: 6 }} />
                管理陪练资料
              </Link>
            </div>
          </div>
          {loading ? (
            <StateBlock tone="loading" size="compact" title="正在加载" description="同步陪练状态" />
          ) : activePlayers.length === 0 ? (
            <StateBlock
              tone="empty"
              size="compact"
              title="暂无陪练档案"
              description="先去创建陪练资料"
            />
          ) : (
            <div className="admin-table-wrap">
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
                      <td data-label="名字" className="admin-text-strong">
                        {player.name}
                      </td>
                      <td data-label="状态">
                        <span className="admin-badge neutral">{player.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <h3>快速入口</h3>
          </div>
          <div className="admin-stack" style={{ marginTop: 10 }}>
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
              记账登记
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
