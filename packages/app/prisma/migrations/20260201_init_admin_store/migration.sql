-- CreateTable
CREATE TABLE "AdminOrder" (
    "id" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "note" TEXT,
    "assignedTo" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "AdminOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminPlayer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "contact" TEXT,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "AdminPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAnnouncement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "AdminAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorSessionId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminPaymentEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "orderNo" TEXT,
    "amount" DOUBLE PRECISION,
    "status" TEXT,
    "verified" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB,

    CONSTRAINT "AdminPaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminOrder_createdAt_idx" ON "AdminOrder"("createdAt");

-- CreateIndex
CREATE INDEX "AdminOrder_stage_idx" ON "AdminOrder"("stage");

-- CreateIndex
CREATE INDEX "AdminOrder_paymentStatus_idx" ON "AdminOrder"("paymentStatus");

-- CreateIndex
CREATE INDEX "AdminPlayer_createdAt_idx" ON "AdminPlayer"("createdAt");

-- CreateIndex
CREATE INDEX "AdminPlayer_status_idx" ON "AdminPlayer"("status");

-- CreateIndex
CREATE INDEX "AdminAnnouncement_createdAt_idx" ON "AdminAnnouncement"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAnnouncement_status_idx" ON "AdminAnnouncement"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");

-- CreateIndex
CREATE INDEX "AdminPaymentEvent_createdAt_idx" ON "AdminPaymentEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AdminPaymentEvent_orderNo_idx" ON "AdminPaymentEvent"("orderNo");
