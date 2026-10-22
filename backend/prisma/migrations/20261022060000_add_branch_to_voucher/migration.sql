-- AlterTable
ALTER TABLE "Voucher" ADD COLUMN "branchId" INTEGER;

-- CreateIndex
CREATE INDEX "Voucher_branchId_idx" ON "Voucher"("branchId");

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill existing vouchers based on referenced Sale
UPDATE "Voucher" v
SET "branchId" = s."branchId"
FROM "Sale" s
WHERE v."reference" = s."invoiceNumber" AND v."branchId" IS NULL;

-- Backfill existing vouchers based on referenced Purchase
UPDATE "Voucher" v
SET "branchId" = p."branchId"
FROM "Purchase" p
WHERE v."reference" = p."invoiceNumber" AND v."branchId" IS NULL;

-- Fallback for any remaining vouchers: match creator's branchId if set
UPDATE "Voucher" v
SET "branchId" = u."branchId"
FROM "User" u
WHERE v."createdBy" = u."id" AND v."branchId" IS NULL AND u."branchId" IS NOT NULL;

-- Default any remaining vouchers to branch 1
UPDATE "Voucher"
SET "branchId" = 1
WHERE "branchId" IS NULL;
