-- AlterTable
ALTER TABLE "resources" ADD COLUMN     "closeTime" TEXT NOT NULL DEFAULT '20:00',
ADD COLUMN     "openTime" TEXT NOT NULL DEFAULT '08:00',
ADD COLUMN     "slotDurationMinutes" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "address" TEXT,
ADD COLUMN     "cancellationPolicy" TEXT DEFAULT 'Free cancellation up to 24 hours prior to booking start time.',
ADD COLUMN     "phone" TEXT;
