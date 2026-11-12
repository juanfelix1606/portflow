import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import { hashPassword } from "../features/auth/password.ts";
import { PrismaClient } from "../generated/prisma/client.ts";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set before seeding.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString })
});

const roleNames = ["ADMIN", "GATE_OPERATOR", "YARD_OPERATOR"] as const;
const yards = [
  { code: "A-01", zone: "A", capacity: 100 },
  { code: "B-01", zone: "B", capacity: 100 }
] as const;
const demoAdminEmail = process.env.DEMO_ADMIN_EMAIL?.trim().toLowerCase();
const demoAdminPassword = process.env.DEMO_ADMIN_PASSWORD;

try {
  for (const name of roleNames) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name }
    });
  }

  for (const yard of yards) {
    await prisma.yard.upsert({
      where: { code: yard.code },
      update: { zone: yard.zone, capacity: yard.capacity, isActive: true },
      create: yard
    });
  }

  if (Boolean(demoAdminEmail) !== Boolean(demoAdminPassword)) {
    throw new Error("Set both DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD, or leave both empty.");
  }

  if (demoAdminEmail && demoAdminPassword) {
    const email = z.email().safeParse(demoAdminEmail);

    if (!email.success || demoAdminPassword.length < 12 || demoAdminPassword.length > 128) {
      throw new Error("Demo admin credentials must use a valid email and a 12-128 character password.");
    }

    const adminRole = await prisma.role.findUnique({ where: { name: "ADMIN" } });

    if (!adminRole) {
      throw new Error("The ADMIN role must exist before seeding a demo admin.");
    }

    await prisma.user.upsert({
      where: { email: demoAdminEmail },
      update: { roleId: adminRole.id, isActive: true },
      create: {
        name: "Portflow Demo Administrator",
        email: demoAdminEmail,
        passwordHash: await hashPassword(demoAdminPassword),
        roleId: adminRole.id
      }
    });
  } else {
    console.info("Skipping demo admin seed; configure both DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD.");
  }
} finally {
  await prisma.$disconnect();
}
