"use client";
import { t } from "@/lib/i18n/i18n-client";

import type { LocalOrder } from "@/lib/services/order-store";
import { Step } from "./schedule-data";

type NotifyingViewProps = {
  currentOrder: LocalOrder;
  escrowFeeDisplay: number;
};

export function NotifyingView({ currentOrder, escrowFeeDisplay }: NotifyingViewProps) {
  return (
    <div className="ride-shell">
      <div className="ride-tip" style={{ marginTop: 0 }}>
        正在通知陪练，需陪练支付押金后才能接单
      </div>
      <div className="ride-stepper">
        <Step
          label={`托管费 ¥${escrowFeeDisplay.toFixed(2)} 已收`}
          done={!!currentOrder.serviceFeePaid}
        />
        <Step label={t("schedule.notifying_view.001")} done={!!currentOrder.depositPaid} />
        <Step label={t("schedule.notifying_view.002")} done={!!currentOrder.driver} />
      </div>
      <div className="ride-notify-illu" />
      <div className="dl-card" style={{ padding: 16 }}>
        <div className="text-sm font-semibold text-gray-900 mb-2">{t("ui.notifying-view.030")}</div>
        <div className="flex justify-between text-sm">
          <span>{currentOrder.item}</span>
          <span className="text-amber-600 font-bold">¥{currentOrder.amount}</span>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          {new Date(currentOrder.time).toLocaleString()}
        </div>
        <div className="text-xs text-gray-500 mt-3">
          押金未付前不会进入服务阶段，费用已由钻石托管。
        </div>
      </div>
    </div>
  );
}
