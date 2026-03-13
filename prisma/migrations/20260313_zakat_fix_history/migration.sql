-- CreateTable
CREATE TABLE "ZakatFixHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "warningId" TEXT NOT NULL,
    "warningType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "bucketId" TEXT,
    "investmentId" TEXT,
    "debtId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "oldState" TEXT,
    "newState" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" DATETIME,
    "undoneAt" DATETIME,
    CONSTRAINT "ZakatFixHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ZakatFixHistory_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "CashBucket" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ZakatFixHistory_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ZakatFixHistory_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ZakatFixHistory_userId_idx" ON "ZakatFixHistory"("userId");
CREATE INDEX "ZakatFixHistory_status_idx" ON "ZakatFixHistory"("status");
CREATE INDEX "ZakatFixHistory_createdAt_idx" ON "ZakatFixHistory"("createdAt");
