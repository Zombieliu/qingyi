CREATE TABLE "MantouWallet" (
  "address" TEXT NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "frozen" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3),

  CONSTRAINT "MantouWallet_pkey" PRIMARY KEY ("address")
);

CREATE TABLE "MantouTransaction" (
  "id" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "orderId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MantouTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MantouWithdrawRequest" (
  "id" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "note" TEXT,
  "account" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3),

  CONSTRAINT "MantouWithdrawRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MantouWallet_createdAt_idx" ON "MantouWallet"("createdAt");
CREATE INDEX "MantouTransaction_address_idx" ON "MantouTransaction"("address");
CREATE INDEX "MantouTransaction_orderId_idx" ON "MantouTransaction"("orderId");
CREATE INDEX "MantouTransaction_createdAt_idx" ON "MantouTransaction"("createdAt");
CREATE UNIQUE INDEX "MantouTransaction_orderId_type_key" ON "MantouTransaction"("orderId", "type");
CREATE INDEX "MantouWithdrawRequest_address_idx" ON "MantouWithdrawRequest"("address");
CREATE INDEX "MantouWithdrawRequest_status_idx" ON "MantouWithdrawRequest"("status");
CREATE INDEX "MantouWithdrawRequest_createdAt_idx" ON "MantouWithdrawRequest"("createdAt");
