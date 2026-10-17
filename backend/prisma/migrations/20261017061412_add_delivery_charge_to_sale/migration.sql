-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "deliveryCharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "hasDeliveryCharge" BOOLEAN NOT NULL DEFAULT false;
