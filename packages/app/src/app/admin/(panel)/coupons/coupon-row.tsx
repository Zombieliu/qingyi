"use client";
import { t } from "@/lib/i18n/t";
import type { AdminCoupon, CouponStatus } from "@/lib/admin/admin-types";
import { COUPON_STATUS_OPTIONS } from "@/lib/admin/admin-types";
import { formatDateISO } from "@/lib/shared/date-utils";

function toDateInput(ts?: number | null) {
  if (!ts) return "";
  return formatDateISO(ts);
}

type RowProps = {
  coupon: AdminCoupon;
  saving: boolean;
  onLocalChange: (id: string, patch: Partial<AdminCoupon>) => void;
  onUpdate: (id: string, patch: Partial<AdminCoupon>) => void;
};

export function CouponRow({ coupon, saving, onLocalChange, onUpdate }: RowProps) {
  return (
    <tr>
      <td data-label={t("admin.coupons.014")}>
        <div className="admin-text-strong">{coupon.title}</div>
        <div className="admin-meta">{coupon.code || "-"}</div>
      </td>
      <td data-label={t("admin.coupons.015")}>
        <input
          className="admin-input"
          value={coupon.discount ?? ""}
          onChange={(e) =>
            onLocalChange(coupon.id, {
              discount: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          onBlur={(e) =>
            onUpdate(coupon.id, { discount: e.target.value ? Number(e.target.value) : null })
          }
        />
      </td>
      <td data-label={t("admin.coupons.016")}>
        <input
          className="admin-input"
          value={coupon.minSpend ?? ""}
          onChange={(e) =>
            onLocalChange(coupon.id, {
              minSpend: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          onBlur={(e) =>
            onUpdate(coupon.id, { minSpend: e.target.value ? Number(e.target.value) : null })
          }
        />
      </td>
      <td data-label={t("admin.coupons.017")}>
        <select
          className="admin-select"
          value={coupon.status}
          onChange={(e) => {
            const next = e.target.value as CouponStatus;
            onLocalChange(coupon.id, { status: next });
            onUpdate(coupon.id, { status: next });
          }}
        >
          {COUPON_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </td>
      <td data-label={t("admin.coupons.018")}>
        <input
          className="admin-input"
          type="date"
          value={toDateInput(coupon.startsAt)}
          onChange={(e) =>
            onLocalChange(coupon.id, {
              startsAt: e.target.value ? new Date(e.target.value).getTime() : undefined,
            })
          }
          onBlur={(e) =>
            onUpdate(coupon.id, {
              startsAt: e.target.value ? new Date(e.target.value).getTime() : null,
            })
          }
        />
        <input
          className="admin-input"
          type="date"
          value={toDateInput(coupon.expiresAt)}
          onChange={(e) =>
            onLocalChange(coupon.id, {
              expiresAt: e.target.value ? new Date(e.target.value).getTime() : undefined,
            })
          }
          onBlur={(e) =>
            onUpdate(coupon.id, {
              expiresAt: e.target.value ? new Date(e.target.value).getTime() : null,
            })
          }
          style={{ marginTop: 6 }}
        />
      </td>
      <td data-label={t("admin.coupons.019")}>
        <input
          className="admin-input"
          value={coupon.description || ""}
          onChange={(e) => onLocalChange(coupon.id, { description: e.target.value })}
          onBlur={(e) => onUpdate(coupon.id, { description: e.target.value })}
        />
      </td>
      <td data-label={t("admin.coupons.020")}>
        <span className="admin-badge neutral">
          {saving ? t("ui.coupons.525") : t("admin.coupons.021")}
        </span>
      </td>
    </tr>
  );
}
