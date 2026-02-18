-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "inviterAddress" TEXT NOT NULL,
    "inviteeAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rewardInviter" INTEGER,
    "rewardInvitee" INTEGER,
    "triggerOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "rewardedAt" TIMESTAMP(3),

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "mode" TEXT NOT NULL DEFAULT 'fixed',
    "fixedInviter" INTEGER NOT NULL DEFAULT 50,
    "fixedInvitee" INTEGER NOT NULL DEFAULT 30,
    "percentInviter" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "percentInvitee" DOUBLE PRECISION NOT NULL DEFAULT 0.03,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "ReferralConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Referral_inviteeAddress_key" ON "Referral"("inviteeAddress");

-- CreateIndex
CREATE INDEX "Referral_inviterAddress_idx" ON "Referral"("inviterAddress");

-- CreateIndex
CREATE INDEX "Referral_status_idx" ON "Referral"("status");

-- CreateIndex
CREATE INDEX "Referral_createdAt_idx" ON "Referral"("createdAt");

-- Seed default config
INSERT INTO "ReferralConfig" ("id", "mode", "fixedInviter", "fixedInvitee", "percentInviter", "percentInvitee", "enabled")
VALUES ('default', 'fixed', 50, 30, 0.05, 0.03, true)
ON CONFLICT ("id") DO NOTHING;
