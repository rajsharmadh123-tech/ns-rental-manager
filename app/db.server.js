import { PrismaClient } from "@prisma/client";

const dbUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:Rajsharma%402026@db.qdtqykyowopampiwisov.supabase.co:5432/postgres";

const prismaClientOptions = dbUrl
  ? { datasources: { db: { url: dbUrl } } }
  : {};

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient(prismaClientOptions);
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient(prismaClientOptions);

export default prisma;
