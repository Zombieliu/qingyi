export type OrderStage = "待处理" | "已确认" | "进行中" | "已完成" | "已取消";
export type PlayerStatus = "可接单" | "忙碌" | "停用";
export type AnnouncementStatus = "draft" | "published" | "archived";
export type SupportStatus = "待处理" | "处理中" | "已完成";
export type CouponStatus = "可用" | "停用" | "已过期";
export type InvoiceStatus = "待审核" | "已开票" | "已拒绝";
export type GuardianStatus = "待审核" | "面试中" | "已通过" | "已拒绝";
export type MembershipTierStatus = "上架" | "下架";
export type MemberStatus = "有效" | "已过期" | "待开通";
export type MembershipRequestStatus = "待审核" | "已通过" | "已拒绝";
export type MantouWithdrawStatus = "待审核" | "已通过" | "已打款" | "已拒绝" | "已退回";
export type RedeemRewardType = "mantou" | "diamond" | "vip" | "coupon" | "custom";
export type RedeemCodeStatus = "active" | "disabled" | "exhausted" | "expired";
export type RedeemRecordStatus = "pending" | "success" | "failed";
export const MANTOU_WITHDRAW_STATUS_OPTIONS: MantouWithdrawStatus[] = [
  "待审核",
  "已通过",
  "已打款",
  "已拒绝",
  "已退回",
];
export type AdminRole = "admin" | "ops" | "finance" | "viewer";
export type AdminTokenStatus = "active" | "disabled";
export const ADMIN_TOKEN_STATUS_OPTIONS: AdminTokenStatus[] = ["active", "disabled"];

export interface AdminSession {
  id: string;
  tokenHash: string;
  role: AdminRole;
  label?: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt?: number;
  ip?: string;
  userAgent?: string;
}

export interface AdminAccessToken {
  id: string;
  tokenHash: string;
  tokenPrefix: string;
  role: AdminRole;
  label?: string;
  status: AdminTokenStatus;
  createdAt: number;
  updatedAt?: number;
  lastUsedAt?: number;
}

export interface AdminAuditLog {
  id: string;
  actorRole: AdminRole;
  actorSessionId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
  ip?: string;
  createdAt: number;
}

export interface AdminPaymentEvent {
  id: string;
  provider: string;
  event: string;
  orderNo?: string;
  amount?: number;
  status?: string;
  verified: boolean;
  createdAt: number;
  raw?: Record<string, unknown>;
}

export interface LedgerRecord {
  id: string;
  userAddress: string;
  diamondAmount: number;
  amount?: number;
  currency?: string;
  channel?: string;
  status: string;
  orderId?: string;
  receiptId?: string;
  source?: string;
  note?: string;
  meta?: Record<string, unknown>;
  createdAt: number;
  updatedAt?: number;
}

export interface GrowthEvent {
  id: string;
  event: string;
  clientId?: string;
  sessionId?: string;
  userAddress?: string;
  path?: string;
  referrer?: string;
  ua?: string;
  meta?: Record<string, unknown>;
  createdAt: number;
}

export interface AdminOrder {
  id: string;
  user: string;
  userAddress?: string;
  companionAddress?: string;
  item: string;
  amount: number;
  currency: string;
  paymentStatus: string;
  stage: OrderStage;
  /** Server-computed display status from chainStatus (single source of truth) */
  displayStatus: string;
  note?: string;
  assignedTo?: string;
  source?: string;
  chainDigest?: string;
  chainStatus?: number;
  serviceFee?: number;
  deposit?: number;
  meta?: Record<string, unknown>;
  createdAt: number;
  updatedAt?: number;
}

export interface AdminPlayer {
  id: string;
  name: string;
  role?: string;
  contact?: string;
  address?: string;
  wechatQr?: string;
  alipayQr?: string;
  depositBase?: number;
  depositLocked?: number;
  creditMultiplier?: number;
  creditLimit?: number;
  usedCredit?: number;
  availableCredit?: number;
  status: PlayerStatus;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface AdminAnnouncement {
  id: string;
  title: string;
  tag: string;
  content: string;
  status: AnnouncementStatus;
  createdAt: number;
  updatedAt?: number;
}

export interface AdminSupportTicket {
  id: string;
  userName?: string;
  userAddress?: string;
  contact?: string;
  topic?: string;
  message: string;
  status: SupportStatus;
  note?: string;
  meta?: Record<string, unknown>;
  createdAt: number;
  updatedAt?: number;
}

export interface AdminCoupon {
  id: string;
  title: string;
  code?: string;
  description?: string;
  discount?: number | null;
  minSpend?: number | null;
  status: CouponStatus;
  startsAt?: number | null;
  expiresAt?: number | null;
  createdAt: number;
  updatedAt?: number;
}

export interface AdminRedeemBatch {
  id: string;
  title: string;
  description?: string;
  rewardType: RedeemRewardType;
  rewardPayload?: Record<string, unknown>;
  status: RedeemCodeStatus;
  maxRedeem?: number | null;
  maxRedeemPerUser?: number | null;
  totalCodes?: number | null;
  usedCount?: number | null;
  startsAt?: number | null;
  expiresAt?: number | null;
  createdAt: number;
  updatedAt?: number;
}

export interface AdminRedeemCode {
  id: string;
  batchId?: string | null;
  code: string;
  status: RedeemCodeStatus;
  maxRedeem: number;
  maxRedeemPerUser: number;
  usedCount: number;
  rewardType?: RedeemRewardType;
  rewardPayload?: Record<string, unknown>;
  startsAt?: number | null;
  expiresAt?: number | null;
  note?: string;
  createdAt: number;
  updatedAt?: number;
  lastRedeemedAt?: number;
}

export interface AdminRedeemRecord {
  id: string;
  codeId: string;
  batchId?: string | null;
  userAddress: string;
  rewardType: RedeemRewardType;
  rewardPayload?: Record<string, unknown>;
  status: RedeemRecordStatus;
  createdAt: number;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
}

export interface AdminInvoiceRequest {
  id: string;
  user?: string;
  userAddress?: string;
  contact?: string;
  email?: string;
  orderId?: string;
  amount?: number;
  title?: string;
  taxId?: string;
  address?: string;
  status: InvoiceStatus;
  note?: string;
  meta?: Record<string, unknown>;
  createdAt: number;
  updatedAt?: number;
}

export interface AdminGuardianApplication {
  id: string;
  user?: string;
  userAddress?: string;
  contact?: string;
  games?: string;
  experience?: string;
  availability?: string;
  status: GuardianStatus;
  note?: string;
  meta?: Record<string, unknown>;
  createdAt: number;
  updatedAt?: number;
}

export interface AdminMembershipTier {
  id: string;
  name: string;
  level: number;
  badge?: string;
  price?: number | null;
  durationDays?: number | null;
  minPoints?: number | null;
  status: MembershipTierStatus;
  perks?: Array<{ label: string; desc?: string }> | string[];
  createdAt: number;
  updatedAt?: number;
}

export interface AdminMember {
  id: string;
  userAddress?: string;
  userName?: string;
  tierId?: string;
  tierName?: string;
  points?: number | null;
  status: MemberStatus;
  expiresAt?: number | null;
  note?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface AdminMembershipRequest {
  id: string;
  userAddress?: string;
  userName?: string;
  contact?: string;
  tierId?: string;
  tierName?: string;
  status: MembershipRequestStatus;
  note?: string;
  meta?: Record<string, unknown>;
  createdAt: number;
  updatedAt?: number;
}

export interface MantouWallet {
  address: string;
  balance: number;
  frozen: number;
  createdAt: number;
  updatedAt?: number;
}

export interface MantouTransaction {
  id: string;
  address: string;
  type: string;
  amount: number;
  orderId?: string;
  note?: string;
  createdAt: number;
}

export interface MantouWithdrawRequest {
  id: string;
  address: string;
  amount: number;
  status: MantouWithdrawStatus;
  note?: string;
  account?: string;
  createdAt: number;
  updatedAt?: number;
}

export type ReferralStatus = "pending" | "rewarded";
export type ReferralConfigMode = "fixed" | "percent";

export interface Referral {
  id: string;
  inviterAddress: string;
  inviteeAddress: string;
  status: ReferralStatus;
  rewardInviter?: number;
  rewardInvitee?: number;
  triggerOrderId?: string;
  createdAt: number;
  rewardedAt?: number;
}

export interface ReferralConfig {
  id: string;
  mode: ReferralConfigMode;
  fixedInviter: number;
  fixedInvitee: number;
  percentInviter: number;
  percentInvitee: number;
  enabled: boolean;
  updatedAt?: number;
}

export type LeaderboardType = "spend" | "companion" | "referral";
export type LeaderboardPeriod = "all" | "week" | "month";

export interface LeaderboardEntry {
  rank: number;
  address: string;
  value: number;
  extra?: number;
}

export interface AdminStore {
  orders: AdminOrder[];
  players: AdminPlayer[];
  announcements: AdminAnnouncement[];
  sessions: AdminSession[];
  auditLogs: AdminAuditLog[];
  paymentEvents: AdminPaymentEvent[];
  supportTickets: AdminSupportTicket[];
  coupons: AdminCoupon[];
  invoiceRequests: AdminInvoiceRequest[];
  guardianApplications: AdminGuardianApplication[];
  membershipTiers: AdminMembershipTier[];
  members: AdminMember[];
  membershipRequests: AdminMembershipRequest[];
}

export const ORDER_STAGE_OPTIONS: OrderStage[] = ["待处理", "已确认", "进行中", "已完成", "已取消"];
export const PLAYER_STATUS_OPTIONS: PlayerStatus[] = ["可接单", "忙碌", "停用"];
export const ANNOUNCEMENT_STATUS_OPTIONS: AnnouncementStatus[] = ["draft", "published", "archived"];
export const SUPPORT_STATUS_OPTIONS: SupportStatus[] = ["待处理", "处理中", "已完成"];
export const COUPON_STATUS_OPTIONS: CouponStatus[] = ["可用", "停用", "已过期"];
export const INVOICE_STATUS_OPTIONS: InvoiceStatus[] = ["待审核", "已开票", "已拒绝"];
export const GUARDIAN_STATUS_OPTIONS: GuardianStatus[] = ["待审核", "面试中", "已通过", "已拒绝"];
export const MEMBERSHIP_TIER_STATUS_OPTIONS: MembershipTierStatus[] = ["上架", "下架"];
export const MEMBER_STATUS_OPTIONS: MemberStatus[] = ["有效", "已过期", "待开通"];
export const MEMBERSHIP_REQUEST_STATUS_OPTIONS: MembershipRequestStatus[] = [
  "待审核",
  "已通过",
  "已拒绝",
];
export const REDEEM_REWARD_TYPE_OPTIONS: RedeemRewardType[] = [
  "mantou",
  "diamond",
  "vip",
  "coupon",
  "custom",
];
export const REDEEM_CODE_STATUS_OPTIONS: RedeemCodeStatus[] = [
  "active",
  "disabled",
  "exhausted",
  "expired",
];
export const REDEEM_RECORD_STATUS_OPTIONS: RedeemRecordStatus[] = ["pending", "success", "failed"];
export const ADMIN_ROLE_OPTIONS: AdminRole[] = ["admin", "ops", "finance", "viewer"];

export interface OrderReview {
  id: string;
  orderId: string;
  reviewerAddress: string;
  companionAddress: string;
  rating: number;
  content?: string;
  tags?: string[];
  createdAt: number;
}

export const REVIEW_TAG_OPTIONS = [
  "技术好",
  "态度好",
  "有耐心",
  "配合默契",
  "准时上线",
  "沟通顺畅",
  "带飞能力强",
  "氛围轻松",
];
