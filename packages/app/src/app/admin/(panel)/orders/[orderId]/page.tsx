"use client";
import { t } from "@/lib/i18n/i18n-client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { AdminOrder, OrderReview } from "@/lib/admin/admin-types";
import { readCache, writeCache } from "@/lib/shared/client-cache";
import { StateBlock } from "@/app/components/state-block";

function ReviewSection({ orderId }: { orderId: string }) {
  const [review, setReview] = useState<OrderReview | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/review`);
        if (res.ok) {
          setReview(await res.json());
        } else {
          setReview(null);
        }
      } catch {
        setReview(null);
      }
    })();
  }, [orderId]);

  if (review === undefined) return null;
  if (!review) {
    return (
      <div className="admin-card" style={{ marginTop: 16 }}>
        <div className="admin-card-header">
          <h3>{t("ui.orderId.421")}</h3>
        </div>
        <p className="admin-meta" style={{ marginTop: 8 }}>
          暂无评价
        </p>
      </div>
    );
  }

  return (
    <div className="admin-card" style={{ marginTop: 16 }}>
      <div className="admin-card-header">
        <h3>{t("ui.orderId.422")}</h3>
      </div>
      <div className="admin-form" style={{ marginTop: 12 }}>
        <label className="admin-field">
          评分
          <input
            className="admin-input"
            readOnly
            value={`${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)} (${review.rating}/5)`}
          />
        </label>
        {review.tags && review.tags.length > 0 && (
          <label className="admin-field">
            标签
            <input className="admin-input" readOnly value={review.tags.join("、")} />
          </label>
        )}
        {review.content && (
          <label className="admin-field">
            评价内容
            <input className="admin-input" readOnly value={review.content} />
          </label>
        )}
        <label className="admin-field">
          评价时间
          <input
            className="admin-input"
            readOnly
            value={new Date(review.createdAt).toLocaleString()}
          />
        </label>
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  const params = useParams();
  const orderIdRaw = params?.orderId;
  const orderId =
    typeof orderIdRaw === "string" ? orderIdRaw : Array.isArray(orderIdRaw) ? orderIdRaw[0] : "";
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const cacheTtlMs = 60_000;

  useEffect(() => {
    if (!orderId) {
      setError(t("admin.orders.001"));
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const cacheKey = `cache:admin:orders:${orderId}`;
        const cached = readCache<AdminOrder>(cacheKey, cacheTtlMs, true);
        if (cached) {
          setOrder(cached.value);
        }
        const res = await fetch(`/api/admin/orders/${orderId}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data?.error || "订单不存在");
          setOrder(null);
          return;
        }
        const data = (await res.json()) as AdminOrder;
        setOrder(data);
        writeCache(cacheKey, data);
      } catch {
        setError(t("admin.orders.002"));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [orderId]);

  if (loading) {
    return (
      <div className="admin-card">
        <StateBlock
          tone="loading"
          size="compact"
          title={t("admin.orders.004")}
          description={t("admin.orders.003")}
        />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="admin-card">
        <StateBlock
          tone="danger"
          size="compact"
          title={t("admin.orders.005")}
          description={error || "订单不存在"}
          actions={
            <Link href="/admin/orders" className="admin-btn ghost">
              返回订单列表
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>{t("ui.orderId.423")}</h3>
            <div className="admin-meta">{order.id}</div>
          </div>
          <div className="admin-card-actions">
            <Link href="/admin/orders" className="admin-btn ghost">
              返回订单列表
            </Link>
          </div>
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
            <input
              className="admin-input"
              readOnly
              value={new Date(order.createdAt).toLocaleString()}
            />
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
      <ReviewSection orderId={orderId} />
    </div>
  );
}
