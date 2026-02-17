-- CreateIndex
CREATE INDEX "AdminOrder_assignedTo_idx" ON "AdminOrder"("assignedTo");

-- CreateIndex
CREATE INDEX "AdminOrder_companionAddress_idx" ON "AdminOrder"("companionAddress");

-- CreateIndex
CREATE INDEX "AdminOrder_source_idx" ON "AdminOrder"("source");

-- CreateIndex
CREATE INDEX "AdminGuardianApplication_userAddress_idx" ON "AdminGuardianApplication"("userAddress");
