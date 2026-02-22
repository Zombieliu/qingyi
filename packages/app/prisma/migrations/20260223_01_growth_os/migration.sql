-- Growth OS: 全域流量管理系统

CREATE TABLE "GrowthContact" (
    "id" TEXT NOT NULL,
    "userAddress" TEXT,
    "phone" TEXT,
    "wechat" TEXT,
    "platformIds" JSONB,
    "name" TEXT,
    "avatar" TEXT,
    "source" TEXT,
    "lifecycle" TEXT NOT NULL DEFAULT 'stranger',
    "score" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[],
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt" TIMESTAMP(3),
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "assignedTo" TEXT,
    "notes" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GrowthContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthTouchpoint" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channelCode" TEXT NOT NULL,
    "campaignId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "touchType" TEXT NOT NULL DEFAULT 'visit',
    "landingPage" TEXT,
    "referrer" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "deviceType" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "orderId" TEXT,
    "orderAmount" DOUBLE PRECISION,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GrowthTouchpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthChannel" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "monthlyBudget" DOUBLE PRECISION,
    "notes" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GrowthChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthCampaign" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "budget" DOUBLE PRECISION,
    "spent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "targetKpi" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "utmCampaign" TEXT,
    "landingPage" TEXT,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GrowthCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthAsset" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "url" TEXT,
    "shortCode" TEXT,
    "content" TEXT,
    "thumbnail" TEXT,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GrowthAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthFollowUp" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "content" TEXT,
    "result" TEXT,
    "nextFollowAt" TIMESTAMP(3),
    "operatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GrowthFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthAutomation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "trigger" JSONB NOT NULL,
    "action" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "executedCount" INTEGER NOT NULL DEFAULT 0,
    "lastExecutedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GrowthAutomation_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "GrowthContact_userAddress_key" ON "GrowthContact"("userAddress");
CREATE UNIQUE INDEX "GrowthChannel_code_key" ON "GrowthChannel"("code");
CREATE UNIQUE INDEX "GrowthAsset_shortCode_key" ON "GrowthAsset"("shortCode");

-- Indexes
CREATE INDEX "GrowthContact_lifecycle_idx" ON "GrowthContact"("lifecycle");
CREATE INDEX "GrowthContact_source_idx" ON "GrowthContact"("source");
CREATE INDEX "GrowthContact_assignedTo_idx" ON "GrowthContact"("assignedTo");
CREATE INDEX "GrowthContact_score_idx" ON "GrowthContact"("score");
CREATE INDEX "GrowthContact_lastSeenAt_idx" ON "GrowthContact"("lastSeenAt");
CREATE INDEX "GrowthTouchpoint_contactId_createdAt_idx" ON "GrowthTouchpoint"("contactId", "createdAt");
CREATE INDEX "GrowthTouchpoint_channelCode_createdAt_idx" ON "GrowthTouchpoint"("channelCode", "createdAt");
CREATE INDEX "GrowthTouchpoint_campaignId_idx" ON "GrowthTouchpoint"("campaignId");
CREATE INDEX "GrowthTouchpoint_touchType_idx" ON "GrowthTouchpoint"("touchType");
CREATE INDEX "GrowthCampaign_channelId_status_idx" ON "GrowthCampaign"("channelId", "status");
CREATE INDEX "GrowthCampaign_status_idx" ON "GrowthCampaign"("status");
CREATE INDEX "GrowthAsset_campaignId_idx" ON "GrowthAsset"("campaignId");
CREATE INDEX "GrowthAsset_shortCode_idx" ON "GrowthAsset"("shortCode");
CREATE INDEX "GrowthFollowUp_contactId_createdAt_idx" ON "GrowthFollowUp"("contactId", "createdAt");
CREATE INDEX "GrowthFollowUp_operatorId_idx" ON "GrowthFollowUp"("operatorId");
CREATE INDEX "GrowthFollowUp_nextFollowAt_idx" ON "GrowthFollowUp"("nextFollowAt");

-- Foreign keys
ALTER TABLE "GrowthTouchpoint" ADD CONSTRAINT "GrowthTouchpoint_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "GrowthContact"("id") ON DELETE CASCADE;
ALTER TABLE "GrowthTouchpoint" ADD CONSTRAINT "GrowthTouchpoint_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "GrowthCampaign"("id") ON DELETE SET NULL;
ALTER TABLE "GrowthCampaign" ADD CONSTRAINT "GrowthCampaign_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "GrowthChannel"("id") ON DELETE CASCADE;
ALTER TABLE "GrowthAsset" ADD CONSTRAINT "GrowthAsset_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "GrowthCampaign"("id") ON DELETE CASCADE;
ALTER TABLE "GrowthFollowUp" ADD CONSTRAINT "GrowthFollowUp_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "GrowthContact"("id") ON DELETE CASCADE;

-- Seed default channels
INSERT INTO "GrowthChannel" ("id", "code", "name", "icon", "color", "updatedAt") VALUES
  ('ch_douyin', 'douyin', '抖音', '🎵', '#000000', NOW()),
  ('ch_kuaishou', 'kuaishou', '快手', '🎬', '#FF4906', NOW()),
  ('ch_bixin', 'bixin', '比心', '💕', '#FF6B9D', NOW()),
  ('ch_xianyu', 'xianyu', '闲鱼', '🐟', '#FFD700', NOW()),
  ('ch_taobao', 'taobao', '淘宝', '🛒', '#FF4400', NOW()),
  ('ch_xiaohongshu', 'xiaohongshu', '小红书', '📕', '#FE2C55', NOW()),
  ('ch_wechat', 'wechat', '微信', '💬', '#07C160', NOW()),
  ('ch_kook', 'kook', 'Kook', '🎮', '#5865F2', NOW()),
  ('ch_bilibili', 'bilibili', 'B站', '📺', '#00A1D6', NOW()),
  ('ch_organic', 'organic', '自然流量', '🌱', '#4CAF50', NOW()),
  ('ch_direct', 'direct', '直接访问', '🔗', '#9E9E9E', NOW()),
  ('ch_referral', 'referral', '老带新', '🤝', '#FF9800', NOW());
