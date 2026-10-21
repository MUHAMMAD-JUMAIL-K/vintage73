-- AlterTable
ALTER TABLE "DayClose" ADD COLUMN     "actualOpeningCash" DECIMAL(10,2) DEFAULT 0,
ADD COLUMN     "additionalCashAdded" DECIMAL(10,2) DEFAULT 0,
ADD COLUMN     "cashRemovedBeforeOpening" DECIMAL(10,2) DEFAULT 0,
ADD COLUMN     "closingDenominations" JSONB,
ADD COLUMN     "closingExpectedCash" DECIMAL(10,2),
ADD COLUMN     "exceptionApprovalReason" TEXT,
ADD COLUMN     "exceptionApprovedById" INTEGER,
ADD COLUMN     "expectedOpeningCash" DECIMAL(10,2) DEFAULT 0,
ADD COLUMN     "openedAt" TIMESTAMP(3),
ADD COLUMN     "openedById" INTEGER,
ADD COLUMN     "openingApprovedById" INTEGER,
ADD COLUMN     "openingCash" DECIMAL(10,2),
ADD COLUMN     "openingDenominations" JSONB,
ADD COLUMN     "openingDifference" DECIMAL(10,2) DEFAULT 0,
ADD COLUMN     "openingDiscrepancyReason" TEXT,
ADD COLUMN     "openingRemarks" TEXT,
ADD COLUMN     "previousClosingCash" DECIMAL(10,2) DEFAULT 0,
ADD COLUMN     "terminalId" INTEGER,
ADD COLUMN     "verificationChecks" JSONB,
ADD COLUMN     "verificationExceptions" JSONB,
ALTER COLUMN "status" SET DEFAULT 'NOT_OPENED';

-- AddForeignKey
ALTER TABLE "DayClose" ADD CONSTRAINT "DayClose_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayClose" ADD CONSTRAINT "DayClose_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayClose" ADD CONSTRAINT "DayClose_openingApprovedById_fkey" FOREIGN KEY ("openingApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayClose" ADD CONSTRAINT "DayClose_exceptionApprovedById_fkey" FOREIGN KEY ("exceptionApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
