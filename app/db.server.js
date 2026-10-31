import { PrismaClient } from "@prisma/client";

const dbUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres.qdtqykyowopampiwisov:Rajsharma%402026@aws-0-ap-south-1.pooler.supabase.com:5432/postgres";

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
