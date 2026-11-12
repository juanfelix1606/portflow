import "dotenv/config";
import { createApp } from "./app.ts";
import { loadAuthConfig } from "./config/auth-config.ts";
import { PrismaAuthRepository } from "./features/auth/auth.repository.ts";
import { PrismaUserRepository } from "./features/users/user.repository.ts";
import { PrismaContainerRepository } from "./features/containers/container.repository.ts";
import { PrismaGateRepository } from "./features/gate/gate.repository.ts";
import { PrismaYardRepository } from "./features/yard/yard.repository.ts";
import { PrismaDashboardRepository } from "./features/dashboard/dashboard.repository.ts";
import { PrismaAuditRepository } from "./features/audit/audit.repository.ts";
import { createPrismaClient } from "./lib/prisma.ts";

const databaseUrl = process.env.DATABASE_URL;
const port = Number(process.env.PORT ?? 3000);

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set before starting the API.");
}

const prisma = createPrismaClient(databaseUrl);
const authConfig = loadAuthConfig();
const app = createApp({
  authConfig,
  authRepository: new PrismaAuthRepository(prisma),
  userRepository: new PrismaUserRepository(prisma),
  containerRepository: new PrismaContainerRepository(prisma),
  gateRepository: new PrismaGateRepository(prisma),
  yardRepository: new PrismaYardRepository(prisma),
  dashboardRepository: new PrismaDashboardRepository(prisma),
  auditRepository: new PrismaAuditRepository(prisma)
});

await prisma.$connect();

app.listen(port, () => {
  console.log(`Portflow API listening on port ${port}`);
});
