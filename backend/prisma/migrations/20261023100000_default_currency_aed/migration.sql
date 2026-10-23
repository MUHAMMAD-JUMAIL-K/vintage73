-- AlterTable
ALTER TABLE "Branch" ALTER COLUMN "currencyCode" SET DEFAULT 'AED';
ALTER TABLE "Branch" ALTER COLUMN "currencySymbol" SET DEFAULT 'AED';

-- AlterTable
ALTER TABLE "CompanyProfile" ALTER COLUMN "currencyCode" SET DEFAULT 'AED';
ALTER TABLE "CompanyProfile" ALTER COLUMN "currencySymbol" SET DEFAULT 'AED';

-- AlterTable
ALTER TABLE "Sale" ALTER COLUMN "currencyCode" SET DEFAULT 'AED';

-- Update CompanyProfile if it was previously the default INR
UPDATE "CompanyProfile" SET "currencyCode" = 'AED', "currencySymbol" = 'AED' WHERE "currencyCode" = 'INR' OR "currencyCode" IS NULL;
