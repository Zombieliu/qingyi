-- Migration: soft_delete_and_webvital
-- Adds deletedAt columns, missing tables (UserSession, MiniProgramAccount, OrderReview,
-- Notification, WebVital, UserCoupon, LedgerRecord)

-- ============================================================
-- 1. Add deletedAt column to 8 existing tables
-- ============================================================

ALTER TABLE "AdminOrder" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "AdminPlayer" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "AdminAnnouncement" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
-- LedgerRecord is created below with deletedAt included
ALTER TABLE "AdminSupportTicket" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "AdminCoupon" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "AdminInvoiceRequest" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "AdminGuardianApplication" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- deletedAt indexes
CREATE INDEX IF NOT EXISTS "AdminOrder_deletedAt_idx" ON "AdminOrder"("deletedAt");
CREATE INDEX IF NOT EXISTS "AdminPlayer_deletedAt_idx" ON "AdminPlayer"("deletedAt");
CREATE INDEX IF NOT EXISTS "AdminAnnouncement_deletedAt_idx" ON "AdminAnnouncement"("deletedAt");
-- LedgerRecord deletedAt index is in the CREATE TABLE section below
CREATE INDEX IF NOT EXISTS "AdminSupportTicket_deletedAt_idx" ON "AdminSupportTicket"("deletedAt");
CREATE INDEX IF NOT EXISTS "AdminCoupon_deletedAt_idx" ON "AdminCoupon"("deletedAt");
CREATE INDEX IF NOT EXISTS "AdminInvoiceRequest_deletedAt_idx" ON "AdminInvoiceRequest"("deletedAt");
CREATE INDEX IF NOT EXISTS "AdminGuardianApplication_deletedAt_idx" ON "AdminGuardianApplication"("deletedAt");

-- ============================================================
-- 2. Create missing tables
-- ============================================================

-- UserSession
CREATE TABLE IF NOT EXISTS "UserSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserSession_tokenHash_key" ON "UserSession"("tokenHash");
CREATE INDEX IF NOT EXISTS "UserSession_address_idx" ON "UserSession"("address");
CREATE INDEX IF NOT EXISTS "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- MiniProgramAccount
CREATE TABLE IF NOT EXISTS "MiniProgramAccount" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "openid" TEXT NOT NULL,
    "unionid" TEXT,
    "sessionKey" TEXT,
    "userAddress" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "meta" JSONB,
    CONSTRAINT "MiniProgramAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MiniProgramAccount_platform_openid_key" ON "MiniProgramAccount"("platform", "openid");
CREATE INDEX IF NOT EXISTS "MiniProgramAccount_userAddress_idx" ON "MiniProgramAccount"("userAddress");
CREATE INDEX IF NOT EXISTS "MiniProgramAccount_unionid_idx" ON "MiniProgramAccount"("unionid");
CREATE INDEX IF NOT EXISTS "MiniProgramAccount_createdAt_idx" ON "MiniProgramAccount"("createdAt");

-- LedgerRecord
CREATE TABLE IF NOT EXISTS "LedgerRecord" (
    "id" TEXT NOT NULL,
    "userAddress" TEXT NOT NULL,
    "diamondAmount" INTEGER NOT NULL,
    "amount" DECIMAL(12,2),
    "currency" TEXT,
    "channel" TEXT,
    "status" TEXT NOT NULL,
    "orderId" TEXT,
    "receiptId" TEXT,
    "source" TEXT,
    "note" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "LedgerRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LedgerRecord_userAddress_createdAt_idx" ON "LedgerRecord"("userAddress", "createdAt");
CREATE INDEX IF NOT EXISTS "LedgerRecord_orderId_idx" ON "LedgerRecord"("orderId");
CREATE INDEX IF NOT EXISTS "LedgerRecord_receiptId_idx" ON "LedgerRecord"("receiptId");
CREATE INDEX IF NOT EXISTS "LedgerRecord_deletedAt_idx" ON "LedgerRecord"("deletedAt");

-- OrderReview
CREATE TABLE IF NOT EXISTS "OrderReview" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reviewerAddress" TEXT NOT NULL,
    "companionAddress" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" TEXT,
    "tags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrderReview_orderId_key" ON "OrderReview"("orderId");
CREATE INDEX IF NOT EXISTS "OrderReview_companionAddress_idx" ON "OrderReview"("companionAddress");
CREATE INDEX IF NOT EXISTS "OrderReview_createdAt_idx" ON "OrderReview"("createdAt");

-- Notification
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "userAddress" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "orderId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Notification_userAddress_read_idx" ON "Notification"("userAddress", "read");
CREATE INDEX IF NOT EXISTS "Notification_userAddress_createdAt_idx" ON "Notification"("userAddress", "createdAt");

-- UserCoupon
CREATE TABLE IF NOT EXISTS "UserCoupon" (
    "id" TEXT NOT NULL,
    "userAddress" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "couponTitle" TEXT NOT NULL,
    "discount" DECIMAL(12,2),
    "minSpend" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'unused',
    "usedOrderId" TEXT,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserCoupon_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserCoupon_userAddress_couponId_key" ON "UserCoupon"("userAddress", "couponId");
CREATE INDEX IF NOT EXISTS "UserCoupon_userAddress_status_idx" ON "UserCoupon"("userAddress", "status");
CREATE INDEX IF NOT EXISTS "UserCoupon_couponId_idx" ON "UserCoupon"("couponId");

-- WebVital
CREATE TABLE IF NOT EXISTS "WebVital" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "rating" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebVital_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WebVital_name_createdAt_idx" ON "WebVital"("name", "createdAt");
CREATE INDEX IF NOT EXISTS "WebVital_page_createdAt_idx" ON "WebVital"("page", "createdAt");
