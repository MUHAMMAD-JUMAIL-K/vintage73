-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "voucherCode" TEXT,
ADD COLUMN     "voucherDiscount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "originalUnitPrice" DECIMAL(10,2),
ADD COLUMN     "voucherDiscountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CustomerVoucher" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "maximumDiscount" DECIMAL(10,2),
    "minimumPurchaseAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "customerId" INTEGER,
    "branchId" INTEGER,
    "issuedSaleId" INTEGER,
    "redeemedSaleId" INTEGER,
    "redeemedAt" TIMESTAMP(3),
    "usageLimit" INTEGER NOT NULL DEFAULT 1,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerVoucherRedemption" (
    "id" SERIAL NOT NULL,
    "voucherId" INTEGER NOT NULL,
    "saleId" INTEGER NOT NULL,
    "customerId" INTEGER,
    "branchId" INTEGER NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerVoucherRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerVoucher_code_key" ON "CustomerVoucher"("code");

-- CreateIndex
CREATE INDEX "CustomerVoucher_code_idx" ON "CustomerVoucher"("code");

-- CreateIndex
CREATE INDEX "CustomerVoucher_status_idx" ON "CustomerVoucher"("status");

-- CreateIndex
CREATE INDEX "CustomerVoucher_customerId_idx" ON "CustomerVoucher"("customerId");

-- CreateIndex
CREATE INDEX "CustomerVoucher_branchId_idx" ON "CustomerVoucher"("branchId");

-- CreateIndex
CREATE INDEX "CustomerVoucherRedemption_voucherId_idx" ON "CustomerVoucherRedemption"("voucherId");

-- CreateIndex
CREATE INDEX "CustomerVoucherRedemption_saleId_idx" ON "CustomerVoucherRedemption"("saleId");

-- AddForeignKey
ALTER TABLE "CustomerVoucher" ADD CONSTRAINT "CustomerVoucher_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerVoucher" ADD CONSTRAINT "CustomerVoucher_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerVoucher" ADD CONSTRAINT "CustomerVoucher_issuedSaleId_fkey" FOREIGN KEY ("issuedSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerVoucher" ADD CONSTRAINT "CustomerVoucher_redeemedSaleId_fkey" FOREIGN KEY ("redeemedSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerVoucherRedemption" ADD CONSTRAINT "CustomerVoucherRedemption_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "CustomerVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerVoucherRedemption" ADD CONSTRAINT "CustomerVoucherRedemption_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
