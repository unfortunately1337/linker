/*
  Warnings:

  - A unique constraint covering the columns `[credentialId]` on the table `AccessKey` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "AccessKey" ADD COLUMN     "counter" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "credentialId" TEXT,
ADD COLUMN     "credentialPublicKey" TEXT,
ADD COLUMN     "transports" TEXT;

-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "avatarUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AccessKey_credentialId_key" ON "AccessKey"("credentialId");
