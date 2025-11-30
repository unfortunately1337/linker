-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'sent';

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "likesCount" TEXT NOT NULL DEFAULT '0',
ADD COLUMN     "views" TEXT NOT NULL DEFAULT '0';
