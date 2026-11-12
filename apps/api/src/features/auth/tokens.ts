import { createHash, randomBytes, randomUUID } from "node:crypto";
import { errors, jwtVerify, SignJWT } from "jose";
import type { AuthConfig } from "../../config/auth-config.ts";

export function createRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAccessToken(
  userId: string,
  authVersion: number,
  config: AuthConfig,
  now = new Date()
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);

  return new SignJWT({ authVersion })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(config.accessTokenIssuer)
    .setAudience(config.accessTokenAudience)
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + config.accessTokenTtlSeconds)
    .sign(config.accessTokenSecret);
}

export async function verifyAccessToken(
  token: string,
  config: AuthConfig
): Promise<{ userId: string; authVersion: number } | null> {
  try {
    const { payload } = await jwtVerify(token, config.accessTokenSecret, {
      algorithms: ["HS256"],
      issuer: config.accessTokenIssuer,
      audience: config.accessTokenAudience
    });

    return typeof payload.sub === "string" &&
      typeof payload.authVersion === "number" &&
      Number.isSafeInteger(payload.authVersion) &&
      payload.authVersion >= 0
      ? { userId: payload.sub, authVersion: payload.authVersion }
      : null;
  } catch (error) {
    if (error instanceof errors.JOSEError) {
      return null;
    }

    throw error;
  }
}
