-- Add missing AdminPlayer columns to match schema
ALTER TABLE "AdminPlayer"
  ADD COLUMN "address" TEXT,
  ADD COLUMN "wechatQr" TEXT,
  ADD COLUMN "alipayQr" TEXT,
  ADD COLUMN "depositBase" INTEGER,
  ADD COLUMN "depositLocked" INTEGER,
  ADD COLUMN "creditMultiplier" INTEGER;

-- Add index for address
CREATE INDEX "AdminPlayer_address_idx" ON "AdminPlayer"("address");
