import { HttpError } from "../../lib/http-error.ts";
import type { AuthConfig } from "../../config/auth-config.ts";
import type {
  AuthRepository,
  AuthUser,
  PublicUser
} from "./auth.types.ts";
import { verifyPassword } from "./password.ts";
import {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken
} from "./tokens.ts";

// Run the same scrypt cost for unknown users to reduce login-enumeration timing differences.
const DUMMY_PASSWORD_HASH =
  "$scrypt$32768$8$1$AAECAwQFBgcICQoLDA0ODw$Rf2M-yH1Fo0UdkzZoB9JQc-trhVL_C-cd4qUevc_qML6Lng_V_fW2EHxJOkXzrv3zRbYzP9Aar222Sqpc-Ma5g";

export interface AuthTokens {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

function toPublicUser(user: AuthUser): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mustChangePassword: user.mustChangePassword,
    role: user.role.name
  };
}

function invalidCredentials(): HttpError {
  return new HttpError(401, "UNAUTHENTICATED", "Email or password is incorrect.");
}

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly config: AuthConfig,
    private readonly now: () => Date = () => new Date()
  ) {}

  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.repository.findUserByEmail(email.trim().toLowerCase());
    const passwordMatches = await verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH
    );

    if (!user || !user.isActive || !passwordMatches) {
      throw invalidCredentials();
    }

    const tokens = await this.createTokens(user);
    const now = this.now();

    const created = await this.repository.createSession({
      userId: user.id,
      expectedPasswordHash: user.passwordHash,
      expectedAuthVersion: user.authVersion,
      tokenHash: hashRefreshToken(tokens.refreshToken),
      expiresAt: new Date(now.getTime() + this.config.refreshTokenTtlMs)
    });

    if (!created) {
      throw invalidCredentials();
    }

    return tokens;
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const now = this.now();
    const currentTokenHash = hashRefreshToken(refreshToken);
    const session = await this.repository.findSessionByTokenHash(currentTokenHash);

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      !session.user.isActive
    ) {
      throw invalidCredentials();
    }

    const tokens = await this.createTokens(session.user);
    const rotated = await this.repository.rotateSession({
      sessionId: session.id,
      userId: session.userId,
      currentTokenHash,
      nextTokenHash: hashRefreshToken(tokens.refreshToken),
      nextExpiresAt: new Date(now.getTime() + this.config.refreshTokenTtlMs),
      now
    });

    if (!rotated) {
      throw invalidCredentials();
    }

    return tokens;
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) {
      await this.repository.revokeSessionByTokenHash(
        hashRefreshToken(refreshToken),
        this.now()
      );
    }
  }

  private async createTokens(user: AuthUser): Promise<AuthTokens> {
    const now = this.now();

    return {
      user: toPublicUser(user),
      accessToken: await createAccessToken(user.id, user.authVersion, this.config, now),
      refreshToken: createRefreshToken()
    };
  }
}
