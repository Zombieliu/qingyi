export type OrderStage = "待处理" | "已确认" | "进行中" | "已完成" | "已取消";
export type PlayerStatus = "可接单" | "忙碌" | "停用";
export type AnnouncementStatus = "draft" | "published" | "archived";
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
  item: string;
  amount: number;
  currency: string;
  paymentStatus: string;
  stage: OrderStage;
  note?: string;
  assignedTo?: string;
  source?: string;
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

export interface AdminStore {
  orders: AdminOrder[];
  players: AdminPlayer[];
  announcements: AdminAnnouncement[];
  sessions: AdminSession[];
  auditLogs: AdminAuditLog[];
  paymentEvents: AdminPaymentEvent[];
}

export const ORDER_STAGE_OPTIONS: OrderStage[] = ["待处理", "已确认", "进行中", "已完成", "已取消"];
export const PLAYER_STATUS_OPTIONS: PlayerStatus[] = ["可接单", "忙碌", "停用"];
export const ANNOUNCEMENT_STATUS_OPTIONS: AnnouncementStatus[] = ["draft", "published", "archived"];
export const ADMIN_ROLE_OPTIONS: AdminRole[] = ["admin", "ops", "finance", "viewer"];
