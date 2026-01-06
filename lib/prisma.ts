
import { PrismaClient } from "@prisma/client";

declare global {
  // allow global `var` across module reloads in dev
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prisma: PrismaClient = global.prisma || new PrismaClient();
if (process.env.NODE_ENV === "development") global.prisma = prisma;

export default prisma;
