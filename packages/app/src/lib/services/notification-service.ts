import { publishNotificationEvent } from "@/lib/realtime";
import { NotificationMessages } from "@/lib/shared/messages";
import {
  deleteEdgeRowsByFilter,
  fetchEdgeRows,
  getEdgeDbConfig,
  insertEdgeRow,
  patchEdgeRowsByFilter,
  toEpochMs,
} from "@/lib/edge-db/client";
import { randomInt } from "@/lib/shared/runtime-crypto";

export type NotificationType = "order_status" | "referral" | "system" | "growth";

type NotificationRow = {
  id: string;
  userAddress: string;
  type: NotificationType;
  title: string;
  body: string;
  orderId: string | null;
  read: boolean;
  createdAt: string | number | null;
};

type LegacyNotificationStore = {
  createNotification(params: {
    userAddress: string;
    type: NotificationType;
    title: string;
    body: string;
    orderId?: string;
  }): Promise<NotificationRow | null>;
  getUnreadNotifications(userAddress: string, limit?: number): Promise<NotificationRow[]>;
  getNotifications(
    userAddress: string,
    page?: number,
    pageSize?: number
  ): Promise<{
    items: NotificationRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>;
  getUnreadCount(userAddress: string): Promise<number>;
  markAsRead(id: string): Promise<NotificationRow | null>;
  markAllAsRead(userAddress: string): Promise<number>;
  deleteAllNotifications(userAddress: string): Promise<number>;
  notifyOrderStatusChange(params: {
    userAddress: string;
    orderId: string;
    stage: string;
    item: string;
  }): Promise<unknown>;
  notifyCompanionNewOrder(params: {
    companionAddress: string;
    orderId: string;
    item: string;
    amount: number;
  }): Promise<unknown>;
  notifyReferralReward(params: { userAddress: string; reward: number }): Promise<unknown>;
  notifyLevelUp(params: { userAddress: string; tierName: string; level: number }): Promise<unknown>;
};

let legacyStorePromise: Promise<LegacyNotificationStore> | null = null;

async function loadLegacyStore(): Promise<LegacyNotificationStore> {
  const modulePath = "./notification-service-legacy";
  legacyStorePromise ??= import(modulePath).then(
    (mod) => mod as unknown as LegacyNotificationStore
  );
  return legacyStorePromise;
}

function hasEdgeReadConfig() {
  return Boolean(getEdgeDbConfig("read"));
}

function hasEdgeWriteConfig() {
  return Boolean(getEdgeDbConfig("write"));
}

function mapNotification(row: NotificationRow) {
  return {
    id: row.id,
    userAddress: row.userAddress,
    type: row.type,
    title: row.title,
    body: row.body,
    orderId: row.orderId ?? undefined,
    read: Boolean(row.read),
    createdAt: toEpochMs(row.createdAt) ?? Date.now(),
  };
}

async function dispatchNotificationSideEffects(params: {
  userAddress: string;
  type: NotificationType;
  title: string;
  body: string;
  orderId?: string;
  id: string;
}) {
  publishNotificationEvent(params.userAddress, {
    type: "notification",
    id: params.id,
    title: params.title,
    body: params.body,
    notifType: params.type,
    orderId: params.orderId,
    timestamp: Date.now(),
  }).catch((e) => console.warn("[notify] SSE publish failed", e));

  import("@/lib/services/push-service")
    .then(({ sendPushNotification }) =>
      sendPushNotification(params.userAddress, {
        title: params.title,
        body: params.body,
        url: params.orderId ? `/me/orders/${params.orderId}` : "/me/notifications",
        icon: "/icons/icon-192x192.png",
      })
    )
    .catch((e) => console.warn("[notify] web push failed", e));
}

/**
 * 创建通知并通过 SSE 实时推送
 * 自动去重：同一 userAddress + orderId + title 在 60 秒内不重复创建
 */
export async function createNotification(params: {
  userAddress: string;
  type: NotificationType;
  title: string;
  body: string;
  orderId?: string;
}) {
  const { userAddress, type, title, body, orderId } = params;
  if (!userAddress) return null;

  if (!hasEdgeReadConfig() || !hasEdgeWriteConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.createNotification(params);
  }

  if (orderId) {
    const recentRows = await fetchEdgeRows<{ id: string }>(
      "Notification",
      new URLSearchParams({
        select: "id",
        userAddress: `eq.${userAddress}`,
        orderId: `eq.${orderId}`,
        title: `eq.${title}`,
        createdAt: `gte.${new Date(Date.now() - 60_000).toISOString()}`,
        order: "createdAt.desc",
        limit: "1",
      })
    );
    if (recentRows.length > 0) return null;
  }

  const nowIso = new Date().toISOString();
  const id = `NTF-${Date.now()}-${randomInt(1000, 9999)}`;
  await insertEdgeRow("Notification", {
    id,
    userAddress,
    type,
    title,
    body,
    orderId: orderId ?? null,
    read: false,
    createdAt: nowIso,
  });

  await dispatchNotificationSideEffects({ ...params, id });
  return {
    id,
    userAddress,
    type,
    title,
    body,
    orderId: orderId ?? undefined,
    read: false,
    createdAt: Date.now(),
  };
}

/**
 * 获取用户未读通知列表
 */
export async function getUnreadNotifications(userAddress: string, limit = 50) {
  if (!hasEdgeReadConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.getUnreadNotifications(userAddress, limit);
  }

  const rows = await fetchEdgeRows<NotificationRow>(
    "Notification",
    new URLSearchParams({
      select: "id,userAddress,type,title,body,orderId,read,createdAt",
      userAddress: `eq.${userAddress}`,
      read: "eq.false",
      order: "createdAt.desc",
      limit: String(limit),
    })
  );
  return rows.map(mapNotification);
}

/**
 * 获取用户全部通知（分页）
 */
export async function getNotifications(userAddress: string, page = 1, pageSize = 20) {
  if (!hasEdgeReadConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.getNotifications(userAddress, page, pageSize);
  }

  const [totalRows, pageRows] = await Promise.all([
    fetchEdgeRows<{ id: string }>(
      "Notification",
      new URLSearchParams({
        select: "id",
        userAddress: `eq.${userAddress}`,
      })
    ),
    fetchEdgeRows<NotificationRow>(
      "Notification",
      new URLSearchParams({
        select: "id,userAddress,type,title,body,orderId,read,createdAt",
        userAddress: `eq.${userAddress}`,
        order: "createdAt.desc",
        offset: String((Math.max(page, 1) - 1) * pageSize),
        limit: String(pageSize),
      })
    ),
  ]);

  const total = totalRows.length;
  return {
    items: pageRows.map(mapNotification),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * 获取未读数
 */
export async function getUnreadCount(userAddress: string) {
  if (!hasEdgeReadConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.getUnreadCount(userAddress);
  }

  const rows = await fetchEdgeRows<{ id: string }>(
    "Notification",
    new URLSearchParams({
      select: "id",
      userAddress: `eq.${userAddress}`,
      read: "eq.false",
    })
  );
  return rows.length;
}

/**
 * 标记单条已读
 */
export async function markAsRead(id: string) {
  if (!hasEdgeWriteConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.markAsRead(id);
  }

  try {
    const rows = await patchEdgeRowsByFilter<NotificationRow>(
      "Notification",
      new URLSearchParams({
        select: "id,userAddress,type,title,body,orderId,read,createdAt",
        id: `eq.${id}`,
      }),
      { read: true }
    );
    return rows[0] ? mapNotification(rows[0]) : null;
  } catch {
    return null;
  }
}

/**
 * 全部标记已读
 */
export async function markAllAsRead(userAddress: string) {
  if (!hasEdgeWriteConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.markAllAsRead(userAddress);
  }

  const rows = await patchEdgeRowsByFilter<NotificationRow>(
    "Notification",
    new URLSearchParams({
      select: "id",
      userAddress: `eq.${userAddress}`,
      read: "eq.false",
    }),
    { read: true }
  );
  return rows.length;
}

/**
 * 清空用户全部通知
 */
export async function deleteAllNotifications(userAddress: string) {
  if (!hasEdgeWriteConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.deleteAllNotifications(userAddress);
  }

  const rows = await deleteEdgeRowsByFilter<{ id: string }>(
    "Notification",
    new URLSearchParams({
      select: "id",
      userAddress: `eq.${userAddress}`,
    })
  );
  return rows.length;
}

// ─── 便捷方法：业务场景通知 ───

export function notifyOrderStatusChange(params: {
  userAddress: string;
  orderId: string;
  stage: string;
  item: string;
}) {
  const stageLabels = NotificationMessages.STAGE_LABELS;

  import("@/lib/services/kook-service")
    .then(({ isKookEnabled, notifyKookOrderStatus }) => {
      if (isKookEnabled()) {
        notifyKookOrderStatus({
          orderId: params.orderId,
          item: params.item,
          stage: params.stage,
        });
      }
    })
    .catch((e) => console.warn("[notify] kook notification failed", e));

  return createNotification({
    userAddress: params.userAddress,
    type: "order_status",
    title: NotificationMessages.ORDER_STATUS_TITLE,
    body: `${params.item} — ${stageLabels[params.stage] || params.stage}`,
    orderId: params.orderId,
  });
}

export function notifyCompanionNewOrder(params: {
  companionAddress: string;
  orderId: string;
  item: string;
  amount: number;
}) {
  return createNotification({
    userAddress: params.companionAddress,
    type: "order_status",
    title: NotificationMessages.COMPANION_NEW_ORDER_TITLE,
    body: NotificationMessages.COMPANION_NEW_ORDER_BODY(params.item, params.amount),
    orderId: params.orderId,
  });
}

export function notifyReferralReward(params: { userAddress: string; reward: number }) {
  return createNotification({
    userAddress: params.userAddress,
    type: "referral",
    title: NotificationMessages.REFERRAL_REWARD_TITLE,
    body: NotificationMessages.REFERRAL_REWARD_BODY(params.reward),
  });
}

export function notifyLevelUp(params: { userAddress: string; tierName: string; level: number }) {
  return createNotification({
    userAddress: params.userAddress,
    type: "growth",
    title: NotificationMessages.LEVEL_UP_TITLE,
    body: NotificationMessages.LEVEL_UP_BODY(params.tierName),
  });
}
