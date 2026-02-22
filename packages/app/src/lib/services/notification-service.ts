import { prisma } from "@/lib/db";
import { publishNotificationEvent } from "@/lib/realtime";

export type NotificationType = "order_status" | "referral" | "system" | "growth";

/**
 * 创建通知并通过 SSE 实时推送
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

  const notification = await prisma.notification.create({
    data: {
      id: `NTF-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      userAddress,
      type,
      title,
      body,
      orderId: orderId || null,
      read: false,
      createdAt: new Date(),
    },
  });

  // Push via SSE (non-blocking)
  publishNotificationEvent(userAddress, {
    type: "notification",
    id: notification.id,
    title,
    body,
    notifType: type,
    orderId,
    timestamp: Date.now(),
  }).catch(() => {});

  return notification;
}

/**
 * 获取用户未读通知列表
 */
export async function getUnreadNotifications(userAddress: string, limit = 50) {
  return prisma.notification.findMany({
    where: { userAddress, read: false },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * 获取用户全部通知（分页）
 */
export async function getNotifications(userAddress: string, page = 1, pageSize = 20) {
  const where = { userAddress };
  const [total, items] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return {
    items,
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
  return prisma.notification.count({
    where: { userAddress, read: false },
  });
}

/**
 * 标记单条已读
 */
export async function markAsRead(id: string, _userAddress: string) {
  try {
    return await prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  } catch {
    return null;
  }
}

/**
 * 全部标记已读
 */
export async function markAllAsRead(userAddress: string) {
  const result = await prisma.notification.updateMany({
    where: { userAddress, read: false },
    data: { read: true },
  });
  return result.count;
}

// ─── 便捷方法：业务场景通知 ───

export function notifyOrderStatusChange(params: {
  userAddress: string;
  orderId: string;
  stage: string;
  item: string;
}) {
  const stageLabels: Record<string, string> = {
    已支付: "已支付，等待陪练接单",
    进行中: "陪练已接单，服务进行中",
    待结算: "服务完成，待结算",
    已完成: "订单已完成",
    已取消: "订单已取消",
    已退款: "订单已退款",
  };
  return createNotification({
    userAddress: params.userAddress,
    type: "order_status",
    title: `订单状态更新`,
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
    title: "新订单",
    body: `${params.item} ¥${params.amount}，请尽快处理`,
    orderId: params.orderId,
  });
}

export function notifyReferralReward(params: { userAddress: string; reward: number }) {
  return createNotification({
    userAddress: params.userAddress,
    type: "referral",
    title: "邀请奖励到账",
    body: `你邀请的好友已完成首单，获得 ${params.reward} 馒头奖励`,
  });
}

export function notifyLevelUp(params: { userAddress: string; tierName: string; level: number }) {
  return createNotification({
    userAddress: params.userAddress,
    type: "growth",
    title: "等级提升 🎉",
    body: `恭喜升级到 ${params.tierName}`,
  });
}
