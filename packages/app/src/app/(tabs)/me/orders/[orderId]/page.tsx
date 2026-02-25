"use client";
import { t } from "@/lib/i18n/t";

import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchOrderDetail } from "@/lib/services/order-service";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { getCurrentAddress } from "@/lib/chain/qy-chain-lite";
import type { LocalOrder } from "@/lib/services/order-store";
import { StateBlock } from "@/app/components/state-block";
import { formatFullDateTime } from "@/lib/shared/date-utils";
import { ReviewDisplay, type Review } from "./review-display";
import { ReviewForm } from "./review-form";

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatFullDateTime(date);
}

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params?.orderId as string;
  const [order, setOrder] = useState<LocalOrder | null>(null);
  const [review, setReview] = useState<Review | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    (async () => {
      setLoading(true);
      try {
        const detail = await fetchOrderDetail(orderId);
        setOrder(detail);
        // Fetch review
        const address = getCurrentAddress();
        if (address) {
          const res = await fetchWithUserAuth(
            `/api/orders/${orderId}/review?address=${address}`,
            {},
            address
          );
          if (res.ok) {
            setReview(await res.json());
          } else {
            setReview(null);
          }
        } else {
          setReview(null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  const isCompleted =
    order?.status?.includes(t("tabs.me.orders.i067")) ||
    order?.meta?.status === t("tabs.me.orders.i068");
  const isOwner = order?.userAddress && order.userAddress === getCurrentAddress();
  const canReview = isCompleted && isOwner && review === null;

  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/me/orders" className="dl-icon-circle" aria-label={t("me.orders.004")}>
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">{t("ui.orderId.121")}</span>
        </div>
      </header>

      {loading ? (
        <section className="dl-card" style={{ padding: 16 }}>
          <StateBlock tone="loading" size="compact" title={t("me.orders.005")} />
        </section>
      ) : !order ? (
        <section className="dl-card" style={{ padding: 16 }}>
          <StateBlock tone="warning" title={t("me.orders.007")} description={t("me.orders.006")} />
        </section>
      ) : (
        <>
          {/* Order Info */}
          <section className="dl-card" style={{ padding: 16 }}>
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-gray-900">{order.item}</div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                {order.status}
              </span>
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-400">{t("ui.orderId.122")}</span>
                <span className="font-mono text-xs">{order.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{t("ui.orderId.123")}</span>
                <span>{formatTime(order.time)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{t("ui.orderId.124")}</span>
                <span className="font-semibold text-slate-900">¥{order.amount}</span>
              </div>
              {order.serviceFee != null && (
                <div className="flex justify-between">
                  <span className="text-slate-400">{t("ui.orderId.125")}</span>
                  <span>¥{order.serviceFee}</span>
                </div>
              )}
            </div>
            {(() => {
              const profile = (order.meta?.companionProfile || order.meta?.gameProfile || null) as {
                gameName?: string;
                gameId?: string;
              } | null;
              if (!profile?.gameName && !profile?.gameId) return null;
              return (
                <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-600">
                  <div className="text-xs text-slate-400 mb-1">{t("ui.orderId.126")}</div>
                  <div>
                    陪练信息：游戏名 {profile?.gameName || "-"} · ID {profile?.gameId || "-"}
                  </div>
                </div>
              );
            })()}
          </section>

          {/* Review Section */}
          <section className="dl-card" style={{ padding: 16 }}>
            <div className="text-sm font-semibold text-gray-900 mb-3">
              {review ? t("ui.orderId.600") : canReview ? t("ui.orderId.674") : t("me.orders.008")}
            </div>
            {review ? (
              <div>
                <div className="flex items-center gap-1.5 text-emerald-600 text-xs mb-2">
                  <CheckCircle2 size={14} />
                  <span>{t("ui.orderId.127")}</span>
                </div>
                <ReviewDisplay review={review} />
              </div>
            ) : canReview ? (
              <ReviewForm orderId={orderId} onSubmitted={setReview} />
            ) : (
              <p className="text-xs text-slate-400">
                {!isCompleted ? t("ui.orderId.652") : !isOwner ? t("ui.orderId.514") : ""}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
