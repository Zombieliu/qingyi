-- DropForeignKey
ALTER TABLE "RedeemCode" DROP CONSTRAINT "RedeemCode_batchId_fkey";

-- DropForeignKey
ALTER TABLE "RedeemRecord" DROP CONSTRAINT "RedeemRecord_batchId_fkey";

-- DropForeignKey
ALTER TABLE "RedeemRecord" DROP CONSTRAINT "RedeemRecord_codeId_fkey";

-- AlterTable
ALTER TABLE "AdminCoupon" ALTER COLUMN "discount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "minSpend" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "AdminInvoiceRequest" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "AdminMembershipTier" ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "AdminOrder" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "serviceFee" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "deposit" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "AdminPaymentEvent" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "LedgerRecord" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "ReferralConfig" ALTER COLUMN "percentInviter" SET DATA TYPE DECIMAL(5,4),
ALTER COLUMN "percentInvitee" SET DATA TYPE DECIMAL(5,4);

-- AlterTable
ALTER TABLE "UserCoupon" ALTER COLUMN "discount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "minSpend" SET DATA TYPE DECIMAL(12,2);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerTag" (
    "id" TEXT NOT NULL,
    "userAddress" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "note" TEXT,
    "severity" INTEGER NOT NULL DEFAULT 1,
    "reportedBy" TEXT NOT NULL,
    "reportedByRole" TEXT NOT NULL DEFAULT 'companion',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerTag_userAddress_active_idx" ON "CustomerTag"("userAddress", "active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerTag_reportedBy_idx" ON "CustomerTag"("reportedBy");

-- AddForeignKey
ALTER TABLE "RedeemCode" ADD CONSTRAINT "RedeemCode_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RedeemBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedeemRecord" ADD CONSTRAINT "RedeemRecord_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "RedeemCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedeemRecord" ADD CONSTRAINT "RedeemRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RedeemBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
