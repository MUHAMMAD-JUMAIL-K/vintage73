-- AlterTable Sale
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "isExchange" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "exchangeReference" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "returnCreditUsed" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "refundAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable ExchangeTransaction
CREATE TABLE IF NOT EXISTS "ExchangeTransaction" (
    "id" SERIAL NOT NULL,
    "exchangeNumber" TEXT NOT NULL,
    "originalInvoice" TEXT NOT NULL,
    "returnSaleId" INTEGER NOT NULL,
    "newSaleId" INTEGER,
    "customerId" INTEGER,
    "branchId" INTEGER NOT NULL,
    "returnTotal" DECIMAL(10,2) NOT NULL,
    "newPurchaseTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "creditApplied" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "remainingCredit" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "additionalPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "refundAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "settlementType" TEXT NOT NULL DEFAULT 'DIFFERENCE_PAID',
    "paymentMethod" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeTransaction_exchangeNumber_key" ON "ExchangeTransaction"("exchangeNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeTransaction_returnSaleId_key" ON "ExchangeTransaction"("returnSaleId");
CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeTransaction_newSaleId_key" ON "ExchangeTransaction"("newSaleId");
CREATE INDEX IF NOT EXISTS "ExchangeTransaction_branchId_idx" ON "ExchangeTransaction"("branchId");
CREATE INDEX IF NOT EXISTS "ExchangeTransaction_customerId_idx" ON "ExchangeTransaction"("customerId");
CREATE INDEX IF NOT EXISTS "ExchangeTransaction_originalInvoice_idx" ON "ExchangeTransaction"("originalInvoice");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ExchangeTransaction_returnSaleId_fkey'
    ) THEN
        ALTER TABLE "ExchangeTransaction" ADD CONSTRAINT "ExchangeTransaction_returnSaleId_fkey" FOREIGN KEY ("returnSaleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ExchangeTransaction_newSaleId_fkey'
    ) THEN
        ALTER TABLE "ExchangeTransaction" ADD CONSTRAINT "ExchangeTransaction_newSaleId_fkey" FOREIGN KEY ("newSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ExchangeTransaction_branchId_fkey'
    ) THEN
        ALTER TABLE "ExchangeTransaction" ADD CONSTRAINT "ExchangeTransaction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ExchangeTransaction_customerId_fkey'
    ) THEN
        ALTER TABLE "ExchangeTransaction" ADD CONSTRAINT "ExchangeTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
