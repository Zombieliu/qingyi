export type OrderStage = "待处理" | "已确认" | "进行中" | "已完成" | "已取消";
export type PlayerStatus = "可接单" | "忙碌" | "停用";
export type AnnouncementStatus = "draft" | "published" | "archived";
export type SupportStatus = "待处理" | "处理中" | "已完成";
export type CouponStatus = "可用" | "停用" | "已过期";
export type InvoiceStatus = "待审核" | "已开票" | "已拒绝";
export type GuardianStatus = "待审核" | "面试中" | "已通过" | "已拒绝";
export type AdminRole = "admin" | "ops" | "finance" | "viewer";

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
  discount?: number;
  minSpend?: number;
  status: CouponStatus;
  startsAt?: number;
  expiresAt?: number;
  createdAt: number;
  updatedAt?: number;
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
}

export const ORDER_STAGE_OPTIONS: OrderStage[] = ["待处理", "已确认", "进行中", "已完成", "已取消"];
export const PLAYER_STATUS_OPTIONS: PlayerStatus[] = ["可接单", "忙碌", "停用"];
export const ANNOUNCEMENT_STATUS_OPTIONS: AnnouncementStatus[] = ["draft", "published", "archived"];
export const SUPPORT_STATUS_OPTIONS: SupportStatus[] = ["待处理", "处理中", "已完成"];
export const COUPON_STATUS_OPTIONS: CouponStatus[] = ["可用", "停用", "已过期"];
export const INVOICE_STATUS_OPTIONS: InvoiceStatus[] = ["待审核", "已开票", "已拒绝"];
export const GUARDIAN_STATUS_OPTIONS: GuardianStatus[] = ["待审核", "面试中", "已通过", "已拒绝"];
export const ADMIN_ROLE_OPTIONS: AdminRole[] = ["admin", "ops", "finance", "viewer"];
