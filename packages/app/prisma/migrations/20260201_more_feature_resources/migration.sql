-- CreateTable
CREATE TABLE "AdminSupportTicket" (
    "id" TEXT NOT NULL,
    "userName" TEXT,
    "userAddress" TEXT,
    "contact" TEXT,
    "topic" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "AdminSupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminCoupon" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "discount" DOUBLE PRECISION,
    "minSpend" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "AdminCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminInvoiceRequest" (
    "id" TEXT NOT NULL,
    "user" TEXT,
    "userAddress" TEXT,
    "contact" TEXT,
    "email" TEXT,
    "orderId" TEXT,
    "amount" DOUBLE PRECISION,
    "title" TEXT,
    "taxId" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "AdminInvoiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminGuardianApplication" (
    "id" TEXT NOT NULL,
    "user" TEXT,
    "userAddress" TEXT,
    "contact" TEXT,
    "games" TEXT,
    "experience" TEXT,
    "availability" TEXT,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "AdminGuardianApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminSupportTicket_createdAt_idx" ON "AdminSupportTicket"("createdAt");

-- CreateIndex
CREATE INDEX "AdminSupportTicket_status_idx" ON "AdminSupportTicket"("status");

-- CreateIndex
CREATE INDEX "AdminCoupon_status_idx" ON "AdminCoupon"("status");

-- CreateIndex
CREATE INDEX "AdminCoupon_expiresAt_idx" ON "AdminCoupon"("expiresAt");

-- CreateIndex
CREATE INDEX "AdminInvoiceRequest_createdAt_idx" ON "AdminInvoiceRequest"("createdAt");

-- CreateIndex
CREATE INDEX "AdminInvoiceRequest_status_idx" ON "AdminInvoiceRequest"("status");

-- CreateIndex
CREATE INDEX "AdminInvoiceRequest_orderId_idx" ON "AdminInvoiceRequest"("orderId");

-- CreateIndex
CREATE INDEX "AdminGuardianApplication_createdAt_idx" ON "AdminGuardianApplication"("createdAt");

-- CreateIndex
CREATE INDEX "AdminGuardianApplication_status_idx" ON "AdminGuardianApplication"("status");
