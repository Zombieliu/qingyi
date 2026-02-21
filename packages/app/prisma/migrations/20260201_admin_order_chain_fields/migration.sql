-- AlterTable
ALTER TABLE "AdminOrder" ADD COLUMN "userAddress" TEXT;
ALTER TABLE "AdminOrder" ADD COLUMN "companionAddress" TEXT;
ALTER TABLE "AdminOrder" ADD COLUMN "chainDigest" TEXT;
ALTER TABLE "AdminOrder" ADD COLUMN "chainStatus" INTEGER;
ALTER TABLE "AdminOrder" ADD COLUMN "serviceFee" DOUBLE PRECISION;
ALTER TABLE "AdminOrder" ADD COLUMN "deposit" DOUBLE PRECISION;
ALTER TABLE "AdminOrder" ADD COLUMN "meta" JSONB;

-- CreateIndex
CREATE INDEX "AdminOrder_userAddress_idx" ON "AdminOrder"("userAddress");

-- CreateIndex
CREATE INDEX "AdminOrder_chainStatus_idx" ON "AdminOrder"("chainStatus");
