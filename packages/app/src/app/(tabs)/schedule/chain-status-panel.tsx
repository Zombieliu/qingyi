"use client";
import { t } from "@/lib/i18n/i18n-client";
import { Loader2 } from "lucide-react";
import type { ChainOrder } from "@/lib/chain/qy-chain";
import { StateBlock } from "@/app/components/state-block";
import { statusLabel, formatAmount, formatTime } from "./schedule-data";

interface ChainStatusPanelProps {
  chainAddress: string;
  chainLoading: boolean;
  chainError: string | null;
  chainToast: string | null;
  chainUpdatedAt: number | null;
  chainSyncing: boolean;
  chainSyncRetries: number | null;
  chainSyncLastAttemptAt: number | null;
  chainCurrentDisplay: ChainOrder | null;
  chainAction: string | null;
  loadChain: () => Promise<void>;
  setDebugOpen: (open: boolean) => void;
  runChainAction: (
    key: string,
    action: () => Promise<{ digest: string }>,
    success: string,
    syncOrderId?: string
  ) => Promise<boolean>;
  openPrompt: (payload: {
    title: string;
    description?: string;
    placeholder?: string;
    confirmLabel?: string;
    action: (value: string) => Promise<void>;
  }) => void;
  openConfirm: (payload: {
    title: string;
    description?: string;
    confirmLabel?: string;
    action: () => Promise<void>;
  }) => void;
  payServiceFeeOnChain: (orderId: string) => Promise<{ digest: string }>;
  cancelOrderOnChain: (orderId: string) => Promise<{ digest: string }>;
  markCompletedOnChain: (orderId: string) => Promise<{ digest: string }>;
  raiseDisputeOnChain: (orderId: string, evidence: string) => Promise<{ digest: string }>;
  finalizeNoDisputeOnChain: (orderId: string) => Promise<{ digest: string }>;
}

function renderLoadingLabel(loading: boolean, label: string, loadingLabel = t("schedule.004")) {
  if (!loading) return label;
  return (
    <span className="inline-flex items-center gap-1">
      <Loader2 className="h-3.5 w-3.5 spin" />
      {loadingLabel}
    </span>
  );
}

function renderActionLabel(chainAction: string | null, key: string, label: string) {
  if (chainAction !== key) return label;
  return (
    <span className="inline-flex items-center gap-1">
      <Loader2 className="h-3.5 w-3.5 spin" />
      处理中
    </span>
  );
}

export function ChainStatusPanel({
  chainAddress,
  chainLoading,
  chainError,
  chainToast,
  chainUpdatedAt,
  chainSyncing,
  chainSyncRetries,
  chainSyncLastAttemptAt,
  chainCurrentDisplay,
  chainAction,
  loadChain,
  setDebugOpen,
  runChainAction,
  openPrompt,
  openConfirm,
  payServiceFeeOnChain,
  cancelOrderOnChain,
  markCompletedOnChain,
  raiseDisputeOnChain,
  finalizeNoDisputeOnChain,
}: ChainStatusPanelProps) {
  return (
    <div className="dl-card" style={{ marginBottom: 12 }}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">订单状态</div>
        <button
          className="dl-tab-btn"
          style={{ padding: "6px 10px" }}
          onClick={loadChain}
          disabled={chainLoading}
        >
          {renderLoadingLabel(chainLoading, t("schedule.018"), t("schedule.017"))}
        </button>
      </div>
      <div className="text-xs text-gray-500 mt-2">
        当前账号：{chainAddress ? "已登录" : t("schedule.019")}
      </div>
      <div className="text-xs text-gray-500 mt-1">
        上次刷新：{chainUpdatedAt ? new Date(chainUpdatedAt).toLocaleTimeString() : "-"}
      </div>
      {chainSyncLastAttemptAt ? (
        <div className={`text-xs mt-1 ${chainSyncing ? "text-amber-600" : "text-gray-500"}`}>
          {chainSyncing
            ? `链上同步中：剩余重试 ${chainSyncRetries ?? 0} 次，最后尝试 ${new Date(chainSyncLastAttemptAt).toLocaleTimeString()}`
            : `链上同步最后尝试：${new Date(chainSyncLastAttemptAt).toLocaleTimeString()}`}
        </div>
      ) : null}
      <div className="mt-2 flex justify-end">
        <button
          className="dl-tab-btn"
          style={{ padding: "6px 10px" }}
          onClick={() => setDebugOpen(true)}
        >
          链上调试信息
        </button>
      </div>
      {chainError && <div className="mt-2 text-xs text-rose-500">{chainError}</div>}
      {chainToast && <div className="mt-2 text-xs text-emerald-600">{chainToast}</div>}
      {!chainCurrentDisplay ? (
        <StateBlock
          tone={chainLoading ? "loading" : chainError ? "danger" : "empty"}
          size="compact"
          title={chainLoading ? "同步中" : chainError ? "加载失败" : t("schedule.020")}
          description={chainLoading ? "正在刷新链上订单" : chainError || "点击刷新获取最新状态"}
          actions={
            chainLoading ? null : (
              <button className="dl-tab-btn" onClick={loadChain} disabled={chainLoading}>
                {renderLoadingLabel(chainLoading, t("schedule.022"), t("schedule.021"))}
              </button>
            )
          }
        />
      ) : (
        <ChainOrderActions
          display={chainCurrentDisplay}
          chainAction={chainAction}
          runChainAction={runChainAction}
          openPrompt={openPrompt}
          openConfirm={openConfirm}
          payServiceFeeOnChain={payServiceFeeOnChain}
          cancelOrderOnChain={cancelOrderOnChain}
          markCompletedOnChain={markCompletedOnChain}
          raiseDisputeOnChain={raiseDisputeOnChain}
          finalizeNoDisputeOnChain={finalizeNoDisputeOnChain}
        />
      )}
    </div>
  );
}

function ChainOrderActions({
  display,
  chainAction,
  runChainAction,
  openPrompt,
  openConfirm,
  payServiceFeeOnChain,
  cancelOrderOnChain,
  markCompletedOnChain,
  raiseDisputeOnChain,
  finalizeNoDisputeOnChain,
}: {
  display: ChainOrder;
  chainAction: string | null;
  runChainAction: ChainStatusPanelProps["runChainAction"];
  openPrompt: ChainStatusPanelProps["openPrompt"];
  openConfirm: ChainStatusPanelProps["openConfirm"];
  payServiceFeeOnChain: ChainStatusPanelProps["payServiceFeeOnChain"];
  cancelOrderOnChain: ChainStatusPanelProps["cancelOrderOnChain"];
  markCompletedOnChain: ChainStatusPanelProps["markCompletedOnChain"];
  raiseDisputeOnChain: ChainStatusPanelProps["raiseDisputeOnChain"];
  finalizeNoDisputeOnChain: ChainStatusPanelProps["finalizeNoDisputeOnChain"];
}) {
  return (
    <div className="mt-3 text-xs text-gray-600">
      <div>订单号：{display.orderId}</div>
      <div>状态：{statusLabel(display.status)}</div>
      <div>托管费：¥{formatAmount(display.serviceFee)}</div>
      <div>押金：¥{formatAmount(display.deposit)}</div>
      <div>争议截止：{formatTime(display.disputeDeadline)}</div>
      <div className="mt-2 flex gap-2 flex-wrap">
        {display.status === 0 && (
          <button
            className="dl-tab-btn"
            style={{ padding: "6px 10px" }}
            disabled={chainAction === `pay-${display.orderId}`}
            onClick={() =>
              runChainAction(
                `pay-${display.orderId}`,
                () => payServiceFeeOnChain(display.orderId),
                "托管费已提交",
                display.orderId
              )
            }
          >
            {renderActionLabel(chainAction, `pay-${display.orderId}`, t("schedule.023"))}
          </button>
        )}
        {(display.status === 0 || display.status === 1) && (
          <button
            className="dl-tab-btn"
            style={{ padding: "6px 10px" }}
            disabled={chainAction === `cancel-${display.orderId}`}
            onClick={() =>
              runChainAction(
                `cancel-${display.orderId}`,
                () => cancelOrderOnChain(display.orderId),
                "订单已取消",
                display.orderId
              )
            }
          >
            {renderActionLabel(chainAction, `cancel-${display.orderId}`, t("schedule.024"))}
          </button>
        )}
        {display.status === 2 && (
          <button
            className="dl-tab-btn"
            style={{ padding: "6px 10px" }}
            disabled={chainAction === `complete-${display.orderId}`}
            onClick={() =>
              runChainAction(
                `complete-${display.orderId}`,
                () => markCompletedOnChain(display.orderId),
                "已确认完成",
                display.orderId
              )
            }
          >
            {renderActionLabel(chainAction, `complete-${display.orderId}`, t("schedule.025"))}
          </button>
        )}
        {display.status === 3 && (
          <>
            <button
              className="dl-tab-btn"
              style={{ padding: "6px 10px" }}
              disabled={chainAction === `dispute-${display.orderId}`}
              onClick={() => {
                openPrompt({
                  title: "发起争议",
                  description: "请填写争议说明或证据哈希（可留空）",
                  confirmLabel: "提交争议",
                  action: async (value) => {
                    await runChainAction(
                      `dispute-${display.orderId}`,
                      () => raiseDisputeOnChain(display.orderId, value),
                      "已提交争议",
                      display.orderId
                    );
                  },
                });
              }}
            >
              {renderActionLabel(chainAction, `dispute-${display.orderId}`, t("schedule.026"))}
            </button>
            <button
              className="dl-tab-btn"
              style={{ padding: "6px 10px" }}
              disabled={chainAction === `finalize-${display.orderId}`}
              onClick={() => {
                const deadline = Number(display.disputeDeadline);
                if (Number.isFinite(deadline) && deadline > Date.now()) {
                  openConfirm({
                    title: "确认放弃争议期并立即结算？",
                    description: `争议截止：${new Date(deadline).toLocaleString()}`,
                    confirmLabel: "确认结算",
                    action: async () => {
                      await runChainAction(
                        `finalize-${display.orderId}`,
                        () => finalizeNoDisputeOnChain(display.orderId),
                        "订单已结算",
                        display.orderId
                      );
                    },
                  });
                  return;
                }
                runChainAction(
                  `finalize-${display.orderId}`,
                  () => finalizeNoDisputeOnChain(display.orderId),
                  "订单已结算",
                  display.orderId
                );
              }}
            >
              {renderActionLabel(chainAction, `finalize-${display.orderId}`, t("schedule.027"))}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
