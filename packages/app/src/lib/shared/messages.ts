/**
 * 服务端中文消息常量
 *
 * 将硬编码的中文字符串集中管理，按模块分组。
 * 注意：OrderStage / PlayerStatus 等类型字面量定义在 admin-types.ts，
 * 这里只收录错误消息、通知文案、业务描述等运行时字符串。
 */

// ─── 订单相关 ───

export const OrderMessages = {
  // 错误
  CREATE_FAILED: "创建订单失败",
  NOT_FOUND: "订单不存在",
  NO_PERMISSION: "无权操作此订单",
  STAGE_NOT_SUPPORT_DISPUTE: "当前订单状态不支持发起争议",
  CHAIN_SYNC_FORBIDDEN: "订单状态由系统同步，禁止手动修改",
  STAGE_TRANSITION_DENIED: "订单阶段不允许回退或跨越",
  // 默认状态
  DEFAULT_STATUS: "待处理",
  CANCEL_STATUS: "取消",
  // 对账
  RECONCILE_CHAIN_COMPLETED_LOCAL_NOT: (chainStatus: number, localStage: string) =>
    `链上已完成(status=${chainStatus})但本地状态为${localStage}`,
  RECONCILE_PAID_NO_CHAIN: "本地标记已支付但无链上确认",
  RECONCILE_STUCK_PROCESSING: (hours: number) => `订单进行中超过24小时 (${hours}h)`,
  RECONCILE_REFUND_STATUS_MISMATCH: "订单已退款但支付状态未更新",
  RECONCILE_AMOUNT_MISMATCH: (localAmount: number, chainAmount: number) =>
    `金额不一致: 本地=${localAmount}, 链上=${chainAmount}`,
  RECONCILE_FIX_REFUND_STATUS: "更新支付状态为已退款",
  // 企微通知
  WX_NEW_ORDER_TITLE: "新订单提醒",
  WX_LABEL_USER: "用户",
  WX_LABEL_ITEM: "商品",
  WX_LABEL_AMOUNT: "金额",
  WX_LABEL_STATUS: "状态",
  WX_LABEL_PLAYER: (name: string) => `指定陪练：${name}`,
  WX_LABEL_NOTE: (note: string) => `备注：${note}`,
  WX_LABEL_TIME: "时间",
  WX_LABEL_ORDER_ID: "订单号",
  WX_FALLBACK_PLAYER_NOT_FOUND: "（无法定位陪练，已@全部）",
  WX_FALLBACK_NO_WECHAT_ID: "（未配置企微ID，已@全部）",
  WX_ANONYMOUS_USER: "匿名用户",
} as const;

// ─── 链上交易相关 ───

export const ChainMessages = {
  // 错误
  TX_FAILED: "链上交易失败",
  SPONSOR_BUILD_FAILED: "赞助交易构建失败",
  SPONSOR_INVALID_RESPONSE: "赞助交易返回无效",
  SPONSOR_EXEC_FAILED: "赞助交易失败",
  BROWSER_NOT_SUPPORTED: "浏览器不支持安全签名",
  RULESET_INVALID: "规则集 ID 不合法",
  DEFAULT_COMPANION_MISSING: "未配置默认陪玩地址（NEXT_PUBLIC_QY_DEFAULT_COMPANION）",
  DEFAULT_COMPANION_INVALID: "默认陪玩地址无效",
  CONTRACT_MISSING_HUB_ID: "合约未部署：缺少 DAPP_HUB_ID",
  CONTRACT_MISSING_HUB_VERSION: "合约未部署：缺少 DAPP_HUB_INITIAL_SHARED_VERSION",
  CONTRACT_MISSING_PACKAGE: "合约未部署：缺少 PACKAGE_ID",
  DAPP_HUB_TYPE_UNREADABLE: "无法读取 DappHub 类型",
  AMOUNT_INVALID: "金额不合法",
  ORDER_ID_MUST_BE_NUMERIC: "orderId 必须是数字字符串",
  // Passkey
  PASSKEY_BROWSER_ONLY: "仅支持在浏览器端使用 Passkey",
  PASSKEY_NOT_FOUND: "未找到 Passkey 钱包，请先登录",
  PASSKEY_DATA_CORRUPTED: "Passkey 数据损坏，请重新登录",
  PASSKEY_DATA_INCOMPLETE: "Passkey 数据不完整，请重新登录",
  LOGIN_REQUIRED_KEYWORD: "请先登录",
  // chain-sync API
  CHAIN_ORDER_NOT_FOUND: "链上订单未找到",
  CHAIN_ORDER_NOT_FOUND_BOTH: "订单不存在（链上和本地均未找到）",
  CHAIN_ORDER_NOT_FOUND_CHAIN: "未找到链上订单",
  // chain-error 用户友好提示
  ERROR_GAS_TITLE: "Gas 不足",
  ERROR_GAS_MSG: "链上交易需要少量 SUI 作为手续费，你的钱包余额不足。",
  ERROR_GAS_ACTION: "充值 SUI",
  ERROR_SPONSOR_TITLE: "代付交易失败",
  ERROR_SPONSOR_MSG:
    "平台代付通道暂时不可用，请稍后重试。如果持续失败，可以尝试用自己的 SUI 支付手续费。",
  ERROR_RATE_LIMIT_TITLE: "请求过于频繁",
  ERROR_RATE_LIMIT_MSG: "链上节点繁忙，请等几秒再试。",
  ERROR_RATE_LIMIT_ACTION: "稍后重试",
  ERROR_TIMEOUT_TITLE: "网络超时",
  ERROR_TIMEOUT_MSG: "连接链上节点超时，可能是网络不稳定。请检查网络后重试。",
  ERROR_NOT_LOGGED_IN_TITLE: "未登录",
  ERROR_NOT_LOGGED_IN_MSG: "请先登录或创建账号。",
  ERROR_NOT_LOGGED_IN_ACTION: "去登录",
  ERROR_AUTH_TITLE: "身份验证失败",
  ERROR_AUTH_MSG: "指纹/面容验证未通过或被取消。请重新尝试验证。",
  ERROR_AUTH_ACTION: "重新验证",
  ERROR_CONTRACT_TITLE: "合约执行失败",
  ERROR_CONTRACT_MSG: "链上合约拒绝了这笔操作，可能是订单状态已变更。请刷新页面查看最新状态。",
  ERROR_CONFIG_TITLE: "系统配置错误",
  ERROR_CONFIG_MSG: "链上合约未正确配置，请联系客服。",
  ERROR_CONFIG_ACTION: "联系客服",
  ERROR_DEFAULT_TITLE: "操作失败",
  ERROR_RETRY: "重试",
  ERROR_REFRESH: "刷新",
  // chain cancel
  CANCEL_DEPOSIT_LOCKED: "订单已进入锁押金/争议流程，无法取消",
} as const;

// ─── 支付状态 ───

export const PaymentStatusLabels = {
  UNPAID: "未支付",
  SERVICE_FEE_PAID: "撮合费已付",
  DEPOSIT_LOCKED: "押金已锁定",
  PENDING_SETTLEMENT: "待结算",
  IN_DISPUTE: "争议中",
  SETTLED: "已结算",
  CANCELLED: "已取消",
  UNKNOWN: "未知",
} as const;

// ─── 通知消息 ───

export const NotificationMessages = {
  // 订单状态变更
  ORDER_STATUS_TITLE: "订单状态更新",
  STAGE_LABELS: {
    已支付: "已支付，等待陪练接单",
    进行中: "陪练已接单，服务进行中",
    待结算: "服务完成，待结算",
    已完成: "订单已完成",
    已取消: "订单已取消",
    已退款: "订单已退款",
  } as Record<string, string>,
  // 陪练新订单
  COMPANION_NEW_ORDER_TITLE: "新订单",
  COMPANION_NEW_ORDER_BODY: (item: string, amount: number) => `${item} ¥${amount}，请尽快处理`,
  // 邀请奖励
  REFERRAL_REWARD_TITLE: "邀请奖励到账",
  REFERRAL_REWARD_BODY: (reward: number) => `你邀请的好友已完成首单，获得 ${reward} 馒头奖励`,
  // 等级提升
  LEVEL_UP_TITLE: "等级提升 🎉",
  LEVEL_UP_BODY: (tierName: string) => `恭喜升级到 ${tierName}`,
  // 客服回复
  SUPPORT_REPLY_TITLE: "客服回复",
} as const;

// ─── Kook 通知 ───

export const KookMessages = {
  NEW_ORDER_HEADER: "**📦 新订单**",
  ORDER_ID_LABEL: "订单号",
  ITEM_LABEL: "商品",
  AMOUNT_LABEL: "金额",
  USER_LABEL: "用户",
  TIME_LABEL: "时间",
  STATUS_UPDATE_HEADER: (emoji: string) => `**${emoji} 订单状态更新**`,
  STATUS_LABEL: "状态",
  COMPANION_ACCEPTED_HEADER: "**🎯 陪练接单**",
  COMPANION_LABEL: "陪练",
  DAILY_SUMMARY_HEADER: "**📊 每日汇总**",
  DATE_LABEL: "日期",
  TOTAL_ORDERS_LABEL: "总订单",
  COMPLETED_LABEL: "已完成",
  REVENUE_LABEL: "营收",
  STAGE_EMOJI: {
    已支付: "💰",
    进行中: "🎮",
    待结算: "⏳",
    已完成: "✅",
    已取消: "❌",
    已退款: "💸",
    争议中: "⚠️",
  } as Record<string, string>,
  TEST_MESSAGE: "🔔 情谊电竞测试消息",
} as const;

// ─── 争议相关 ───

export const DisputeMessages = {
  FEATURE_DISABLED: "争议功能暂未开放",
  NO_DISPUTE_RECORD: "该订单没有争议记录",
  CREATE_FAILED: "创建争议失败",
  RESOLVE_FAILED: "处理争议失败",
} as const;

// ─── 优惠券相关 ───

export const CouponMessages = {
  FEATURE_DISABLED: "优惠券功能暂未开放",
} as const;

// ─── 馒头（虚拟货币）相关 ───

export const MantouMessages = {
  INSUFFICIENT_BALANCE: "余额不足",
  INSUFFICIENT_FROZEN: "冻结余额不足",
} as const;

// ─── 认证相关 ───

export const AuthMessages = {
  LOGIN_REQUIRED: "请先登录账号",
} as const;

// ─── 管理后台相关 ───

export const AdminMessages = {
  // 登录
  LOGIN_RATE_LIMITED: "登录过于频繁",
  LOGIN_WRONG_KEY: "密钥错误",
  LOGIN_SERVICE_UNAVAILABLE: "服务暂不可用",
  // 陪练
  PLAYER_NOT_AVAILABLE: "陪练当前不可接单",
  PLAYER_DEPOSIT_INSUFFICIENT: "陪练押金不足，无法派单",
  PLAYER_CREDIT_INSUFFICIENT: (available: number, orderAmount: number) =>
    `授信额度不足（可用 ${available} 元，订单 ${orderAmount} 元）`,
  // 日志
  LOGS_CLEARED: "日志已清空",
  CACHE_CLEARED: "缓存已清空",
  CACHE_REFRESHED: "缓存已刷新",
  // 签到
  ALREADY_CHECKED_IN: "今日已签到",
  // 评价
  REVIEW_REWARD_NOTE: "评价奖励",
  // 钻石兑换
  DIAMOND_EXCHANGE_NOTE: (orderId: string) => `来自订单 ${orderId} 的钻石兑换`,
  // 邀请
  REFERRAL_INVITER_NOTE: (orderId: string) => `邀请返利：被邀请人首单完成 (${orderId})`,
  REFERRAL_INVITEE_NOTE: (orderId: string) => `邀请奖励：首单完成奖励 (${orderId})`,
  // 链上同步
  CHAIN_SYNC_ITEM: (orderId: string) => `链上订单 #${orderId}`,
  CHAIN_SYNC_NOTE: "链上同步",
  // 陪练入驻
  GUARDIAN_DEFAULT_NAME: "陪练",
  GUARDIAN_GAMES_LABEL: (games: string) => `擅长游戏：${games}`,
  GUARDIAN_EXPERIENCE_LABEL: (exp: string) => `段位经验：${exp}`,
  GUARDIAN_AVAILABILITY_LABEL: (avail: string) => `可接单时段：${avail}`,
  GUARDIAN_NOTE_LABEL: (note: string) => `申请备注：${note}`,
  GUARDIAN_ROLE_LABEL: (role: string) => `擅长：${role}`,
  GUARDIAN_ACCEPTED: "已接单",
  GUARDIAN_ETA: "10分钟",
  // 卡密兑换
  REDEEM_NOTE: (recordId: string) => `卡密兑换 ${recordId}`,
  REDEEM_SUCCESS: "兑换成功",
  // 对账 cron
  RECONCILE_ALERT_TITLE: '⚠️ <font color="warning">支付对账告警</font>',
  // 链上对账
  CHAIN_RECONCILE_MISSING: (count: number) => `${count} 个链上订单未同步到本地`,
  CHAIN_RECONCILE_ORPHAN: (count: number) => `${count} 个本地订单在链上找不到`,
  CHAIN_RECONCILE_MISMATCH: (count: number) => `${count} 个订单状态不一致`,
  CHAIN_RECONCILE_REASON_NOT_SYNCED: "链上订单未同步到本地",
  CHAIN_RECONCILE_STATUS_MISMATCH: (chainStatus: number, localStatus: number | null) =>
    `状态不一致：链上=${chainStatus}，本地=${localStatus}`,
} as const;

// ─── 客户标签 ───

export const CustomerTagLabels = {
  difficult: "事多/难伺候",
  slow_pay: "拖延付款",
  rude: "态度差/不礼貌",
  no_show: "放鸽子/不上线",
  frequent_dispute: "频繁发起争议",
  vip_treat: "VIP 优待",
  other: "其他",
} as const;

// ─── Feature Flag 描述 ───

export const FeatureFlagDescriptions = {
  dispute_flow: "订单争议/退款流程",
  push_notifications: "PWA Push 通知",
  advanced_analytics: "高级数据分析面板",
  credit_system: "授信额度系统",
  companion_schedule: "陪练排班功能",
  coupon_system: "优惠券系统",
  referral_rewards: "推荐奖励",
  web_vitals: "Web Vitals 性能上报",
} as const;

// ─── 评价标签 ───

export const ReviewTagLabels = [
  "技术好",
  "态度好",
  "有耐心",
  "配合默契",
  "准时上线",
  "沟通顺畅",
  "带飞能力强",
  "氛围轻松",
] as const;

// ─── 仪表盘 ───

export const DashboardLabels = {
  STEP_VISIT: "访问",
  STEP_INTENT: "下单意向",
  STEP_CREATE: "创建订单",
  STEP_COMPLETE: "完成订单",
} as const;

// ─── 品牌名 ───

export const BrandName = {
  RP_NAME: "情谊电竞",
} as const;

// ─── LEDGER_ADMIN_TOKEN ───

export const LedgerMessages = {
  TOKEN_NOT_CONFIGURED: "LEDGER_ADMIN_TOKEN 未配置",
} as const;
