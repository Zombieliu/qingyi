/**
 * Lightweight feature flag system.
 * Flags can be toggled via env vars or admin API.
 * Format: NEXT_PUBLIC_FF_<FLAG_NAME>=1|0
 *
 * Server-side: reads env + optional DB override
 * Client-side: reads NEXT_PUBLIC_ env vars only
 */

export type FeatureFlag =
  | "dispute_flow" // 订单争议/退款流程
  | "push_notifications" // PWA push notifications
  | "advanced_analytics" // 高级数据分析
  | "credit_system" // 授信额度系统
  | "companion_schedule" // 陪练排班
  | "coupon_system" // 优惠券系统
  | "referral_rewards" // 推荐奖励
  | "web_vitals"; // Web Vitals 上报

type FlagConfig = {
  defaultValue: boolean;
  description: string;
};

const FLAG_REGISTRY: Record<FeatureFlag, FlagConfig> = {
  dispute_flow: { defaultValue: false, description: "订单争议/退款流程" },
  push_notifications: { defaultValue: false, description: "PWA Push 通知" },
  advanced_analytics: { defaultValue: false, description: "高级数据分析面板" },
  credit_system: { defaultValue: true, description: "授信额度系统" },
  companion_schedule: { defaultValue: true, description: "陪练排班功能" },
  coupon_system: { defaultValue: true, description: "优惠券系统" },
  referral_rewards: { defaultValue: true, description: "推荐奖励" },
  web_vitals: { defaultValue: true, description: "Web Vitals 性能上报" },
};

/** Check if a feature flag is enabled (client + server) */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const envKey = `NEXT_PUBLIC_FF_${flag.toUpperCase()}`;
  const envVal = typeof process !== "undefined" ? process.env[envKey] : undefined;
  if (envVal === "1") return true;
  if (envVal === "0") return false;
  return FLAG_REGISTRY[flag]?.defaultValue ?? false;
}

/** Get all flags with current values */
export function getAllFlags(): Array<{ flag: FeatureFlag; enabled: boolean; description: string }> {
  return (Object.keys(FLAG_REGISTRY) as FeatureFlag[]).map((flag) => ({
    flag,
    enabled: isFeatureEnabled(flag),
    description: FLAG_REGISTRY[flag].description,
  }));
}

/** Get flag registry for admin display */
export function getFlagRegistry() {
  return FLAG_REGISTRY;
}
