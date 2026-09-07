-- AlterTable
ALTER TABLE "resources" ADD COLUMN     "operatingDays" TEXT NOT NULL DEFAULT 'MON,TUE,WED,THU,FRI,SAT,SUN';

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "logoUrl" TEXT;
