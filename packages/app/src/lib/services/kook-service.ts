import "server-only";

/**
 * Kook (开黑啦) Bot integration for order notifications.
 *
 * Env vars:
 *   KOOK_BOT_TOKEN - Bot token from Kook developer portal
 *   KOOK_CHANNEL_ID - Default channel ID for notifications
 *
 * API: https://developer.kookapp.cn/doc/http/message
 */

const KOOK_API = "https://www.kookapp.cn/api/v3";
const BOT_TOKEN = process.env.KOOK_BOT_TOKEN || "";
const DEFAULT_CHANNEL = process.env.KOOK_CHANNEL_ID || "";

type KookMessageType = 1 | 2 | 3 | 4 | 9 | 10;
// 1=text, 2=image, 3=video, 4=file, 9=kmarkdown, 10=card

type SendResult = {
  ok: boolean;
  msgId?: string;
  error?: string;
};

async function kookRequest(path: string, body: Record<string, unknown>): Promise<unknown> {
  if (!BOT_TOKEN) throw new Error("KOOK_BOT_TOKEN not configured");

  const res = await fetch(`${KOOK_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Kook API error: ${data.message || JSON.stringify(data)}`);
  }
  return data.data;
}

/** Send a text/kmarkdown message to a channel */
export async function sendChannelMessage(params: {
  content: string;
  channelId?: string;
  type?: KookMessageType;
}): Promise<SendResult> {
  try {
    const data = (await kookRequest("/message/create", {
      target_id: params.channelId || DEFAULT_CHANNEL,
      content: params.content,
      type: params.type || 9, // KMarkdown by default
    })) as { msg_id?: string };

    return { ok: true, msgId: data?.msg_id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Kook] Send failed:", msg);
    return { ok: false, error: msg };
  }
}

/** Send a card message (rich embed) */
export async function sendCardMessage(params: {
  channelId?: string;
  cards: KookCard[];
}): Promise<SendResult> {
  return sendChannelMessage({
    channelId: params.channelId,
    content: JSON.stringify(params.cards),
    type: 10, // Card message
  });
}

// ---- Notification helpers ----

/** Notify new order created */
export async function notifyKookNewOrder(params: {
  orderId: string;
  item: string;
  amount: number;
  userAddress: string;
  channelId?: string;
}) {
  const content = [
    "**📦 新订单**",
    `> 订单号: \`${params.orderId}\``,
    `> 商品: ${params.item}`,
    `> 金额: ¥${params.amount}`,
    `> 用户: \`${params.userAddress.slice(0, 8)}...\``,
    `> 时间: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
  ].join("\n");

  return sendChannelMessage({ content, channelId: params.channelId });
}

/** Notify order status change */
export async function notifyKookOrderStatus(params: {
  orderId: string;
  item: string;
  stage: string;
  channelId?: string;
}) {
  const stageEmoji: Record<string, string> = {
    已支付: "💰",
    进行中: "🎮",
    待结算: "⏳",
    已完成: "✅",
    已取消: "❌",
    已退款: "💸",
    争议中: "⚠️",
  };

  const emoji = stageEmoji[params.stage] || "📋";
  const content = [
    `**${emoji} 订单状态更新**`,
    `> 订单号: \`${params.orderId}\``,
    `> 商品: ${params.item}`,
    `> 状态: **${params.stage}**`,
  ].join("\n");

  return sendChannelMessage({ content, channelId: params.channelId });
}

/** Notify companion accepted order */
export async function notifyKookCompanionAccepted(params: {
  orderId: string;
  companionName: string;
  item: string;
  channelId?: string;
}) {
  const content = [
    "**🎯 陪练接单**",
    `> 订单号: \`${params.orderId}\``,
    `> 陪练: ${params.companionName}`,
    `> 商品: ${params.item}`,
  ].join("\n");

  return sendChannelMessage({ content, channelId: params.channelId });
}

/** Notify daily summary */
export async function notifyKookDailySummary(params: {
  date: string;
  totalOrders: number;
  completedOrders: number;
  revenue: number;
  channelId?: string;
}) {
  const content = [
    "**📊 每日汇总**",
    `> 日期: ${params.date}`,
    `> 总订单: ${params.totalOrders}`,
    `> 已完成: ${params.completedOrders}`,
    `> 营收: ¥${params.revenue.toFixed(2)}`,
  ].join("\n");

  return sendChannelMessage({ content, channelId: params.channelId });
}

/** Check if Kook integration is configured */
export function isKookEnabled(): boolean {
  return !!BOT_TOKEN && !!DEFAULT_CHANNEL;
}

// ---- Card message types ----

type KookCard = {
  type: "card";
  theme?: "primary" | "success" | "danger" | "warning" | "info" | "secondary";
  size?: "sm" | "lg";
  modules: KookModule[];
};

type KookModule =
  | { type: "header"; text: { type: "plain-text"; content: string } }
  | { type: "section"; text: { type: "kmarkdown"; content: string } }
  | { type: "divider" }
  | { type: "context"; elements: Array<{ type: "kmarkdown"; content: string }> };
