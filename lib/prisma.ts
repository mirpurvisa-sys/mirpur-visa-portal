import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
let productionPrisma: PrismaClient | undefined;

export function getPrisma() {
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma ??= new PrismaClient({ log: ["error", "warn"] });
    return globalForPrisma.prisma;
  }

  productionPrisma ??= new PrismaClient({ log: ["error", "warn"] });
  return productionPrisma;
}
