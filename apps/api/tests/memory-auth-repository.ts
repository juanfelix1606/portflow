import type {
  AuthRepository,
  AuthSession,
  AuthUser,
  CreateSessionInput,
  CredentialUser,
  RotateSessionInput
} from "../src/features/auth/auth.types.ts";

function publicUser(user: CredentialUser): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    authVersion: user.authVersion,
    role: user.role
  };
}

export class MemoryAuthRepository implements AuthRepository {
  private readonly users: CredentialUser[];
  private readonly sessions: AuthSession[] = [];
  private nextSessionId = 1;

  constructor(users: CredentialUser[]) {
    this.users = users;
  }

  async findUserByEmail(email: string): Promise<CredentialUser | null> {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async findUserById(id: string): Promise<AuthUser | null> {
    const user = this.users.find((candidate) => candidate.id === id);
    return user ? publicUser(user) : null;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<AuthSession | null> {
    return this.sessions.find((session) => session.tokenHash === tokenHash) ?? null;
  }

  async createSession(input: CreateSessionInput): Promise<boolean> {
    const user = this.users.find((candidate) => candidate.id === input.userId);

    if (
      !user ||
      !user.isActive ||
      user.passwordHash !== input.expectedPasswordHash ||
      user.authVersion !== input.expectedAuthVersion
    ) {
      return false;
    }

    this.sessions.push({
      id: `session-${this.nextSessionId++}`,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      user: publicUser(user)
    });
    return true;
  }

  changeUserPassword(
    userId: string,
    passwordHash: string,
    mustChangePassword: boolean,
    now: Date
  ): void {
    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new Error("Cannot reset the password for a missing test user.");
    }

    user.passwordHash = passwordHash;
    user.mustChangePassword = mustChangePassword;
    user.authVersion += 1;
    for (const session of this.sessions) {
      if (session.userId === userId && !session.revokedAt) {
        session.revokedAt = now;
      }
    }
  }

  async rotateSession(input: RotateSessionInput): Promise<boolean> {
    const session = this.sessions.find(
      (candidate) =>
        candidate.id === input.sessionId &&
        candidate.userId === input.userId &&
        candidate.tokenHash === input.currentTokenHash
    );

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= input.now ||
      !session.user.isActive
    ) {
      return false;
    }

    session.revokedAt = input.now;
    this.sessions.push({
      id: `session-${this.nextSessionId++}`,
      userId: input.userId,
      tokenHash: input.nextTokenHash,
      expiresAt: input.nextExpiresAt,
      revokedAt: null,
      user: session.user
    });

    return true;
  }

  async revokeSessionByTokenHash(tokenHash: string, now: Date): Promise<void> {
    const session = this.sessions.find((candidate) => candidate.tokenHash === tokenHash);

    if (session && !session.revokedAt) {
      session.revokedAt = now;
    }
  }
}
