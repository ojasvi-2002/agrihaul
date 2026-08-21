-- AlterTable
ALTER TABLE "PickupRequest" ADD COLUMN     "product" TEXT,
ADD COLUMN     "locationText" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "primaryDriverId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_primaryDriverId_key" ON "Vehicle"("primaryDriverId");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_primaryDriverId_fkey" FOREIGN KEY ("primaryDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
