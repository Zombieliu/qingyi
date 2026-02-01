"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { AdminOrder } from "@/lib/admin-types";

export default function OrderDetailPage() {
  const params = useParams();
  const orderIdRaw = params?.orderId;
  const orderId =
    typeof orderIdRaw === "string" ? orderIdRaw : Array.isArray(orderIdRaw) ? orderIdRaw[0] : "";
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orderId) {
      setError("缺少订单号");
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/orders/${orderId}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data?.error || "订单不存在");
          setOrder(null);
          return;
        }
        const data = (await res.json()) as AdminOrder;
        setOrder(data);
      } catch {
        setError("加载失败，请稍后重试");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [orderId]);

  if (loading) {
    return <div className="admin-card">加载中...</div>;
  }

  if (!order) {
    return (
      <div className="admin-card">
        <p>{error || "订单不存在"}</p>
        <Link href="/admin/orders" className="admin-btn ghost" style={{ marginTop: 12 }}>
          返回订单列表
        </Link>
      </div>
    );
  }

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h3>订单详情</h3>
            <div style={{ fontSize: 12, color: "#64748b" }}>{order.id}</div>
          </div>
          <Link href="/admin/orders" className="admin-btn ghost">
            返回订单列表
          </Link>
        </div>
        <div className="admin-form" style={{ marginTop: 16 }}>
          <label className="admin-field">
            用户
            <input className="admin-input" readOnly value={order.user} />
          </label>
          <label className="admin-field">
            项目
            <input className="admin-input" readOnly value={order.item} />
          </label>
          <label className="admin-field">
            金额
            <input
              className="admin-input"
              readOnly
              value={`${order.currency === "CNY" ? "¥" : order.currency} ${order.amount}`}
            />
          </label>
          <label className="admin-field">
            付款状态
            <input className="admin-input" readOnly value={order.paymentStatus || ""} />
          </label>
          <label className="admin-field">
            订单阶段
            <input className="admin-input" readOnly value={order.stage} />
          </label>
          <label className="admin-field">
            派单
            <input className="admin-input" readOnly value={order.assignedTo || ""} />
          </label>
          <label className="admin-field">
            备注
            <input className="admin-input" readOnly value={order.note || ""} />
          </label>
          <label className="admin-field">
            来源
            <input className="admin-input" readOnly value={order.source || ""} />
          </label>
          <label className="admin-field">
            创建时间
            <input className="admin-input" readOnly value={new Date(order.createdAt).toLocaleString()} />
          </label>
          <label className="admin-field">
            更新时间
            <input
              className="admin-input"
              readOnly
              value={order.updatedAt ? new Date(order.updatedAt).toLocaleString() : ""}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
