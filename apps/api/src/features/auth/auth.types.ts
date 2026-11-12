import type { RoleName } from "../../generated/prisma/client.ts";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
  authVersion: number;
  role: {
    name: RoleName;
  };
}

export interface CredentialUser extends AuthUser {
  passwordHash: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  user: AuthUser;
}

export interface CreateSessionInput {
  userId: string;
  expectedPasswordHash: string;
  expectedAuthVersion: number;
  tokenHash: string;
  expiresAt: Date;
}

export interface RotateSessionInput {
  sessionId: string;
  userId: string;
  currentTokenHash: string;
  nextTokenHash: string;
  nextExpiresAt: Date;
  now: Date;
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<CredentialUser | null>;
  findUserById(id: string): Promise<AuthUser | null>;
  findSessionByTokenHash(tokenHash: string): Promise<AuthSession | null>;
  createSession(input: CreateSessionInput): Promise<boolean>;
  rotateSession(input: RotateSessionInput): Promise<boolean>;
  revokeSessionByTokenHash(tokenHash: string, now: Date): Promise<void>;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
  role: RoleName;
}
