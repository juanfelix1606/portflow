import type { PrismaClient } from "../../generated/prisma/client.ts";
import type {
  AuthRepository,
  AuthSession,
  AuthUser,
  CreateSessionInput,
  CredentialUser,
  RotateSessionInput
} from "./auth.types.ts";

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findUserByEmail(email: string): Promise<CredentialUser | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        mustChangePassword: true,
        authVersion: true,
        passwordHash: true,
        role: { select: { name: true } }
      }
    });
  }

  findUserById(id: string): Promise<AuthUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        mustChangePassword: true,
        authVersion: true,
        role: { select: { name: true } }
      }
    });
  }

  findSessionByTokenHash(tokenHash: string): Promise<AuthSession | null> {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        tokenHash: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
            mustChangePassword: true,
            authVersion: true,
            role: { select: { name: true } }
          }
        }
      }
    });
  }

  async createSession(input: CreateSessionInput): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const users = await transaction.$queryRaw<Array<{
        id: string;
        password_hash: string;
        is_active: boolean;
        auth_version: number;
      }>>`
        SELECT "id", "password_hash", "is_active", "auth_version"
        FROM "users"
        WHERE "id" = ${input.userId}
        FOR UPDATE
      `;
      const user = users[0];

      if (
        !user ||
        !user.is_active ||
        user.password_hash !== input.expectedPasswordHash ||
        user.auth_version !== input.expectedAuthVersion
      ) {
        return false;
      }

      await transaction.refreshToken.create({
        data: {
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt
        }
      });

      return true;
    });
  }

  rotateSession(input: RotateSessionInput): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const users = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "users"
        WHERE "id" = ${input.userId}
        FOR UPDATE
      `;

      if (users.length === 0) {
        return false;
      }

      const updated = await transaction.refreshToken.updateMany({
        where: {
          id: input.sessionId,
          userId: input.userId,
          tokenHash: input.currentTokenHash,
          revokedAt: null,
          expiresAt: { gt: input.now },
          user: { is: { isActive: true } }
        },
        data: { revokedAt: input.now }
      });

      if (updated.count !== 1) {
        return false;
      }

      await transaction.refreshToken.create({
        data: {
          userId: input.userId,
          tokenHash: input.nextTokenHash,
          expiresAt: input.nextExpiresAt
        }
      });

      return true;
    });
  }

  async revokeSessionByTokenHash(tokenHash: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now }
    });
  }
}
