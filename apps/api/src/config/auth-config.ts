export interface AuthConfig {
  accessTokenAudience: string;
  accessTokenIssuer: string;
  accessTokenSecret: Uint8Array;
  accessTokenTtlSeconds: number;
  isProduction: boolean;
  refreshTokenTtlMs: number;
  webOrigin: string;
}

export function loadAuthConfig(environment: NodeJS.ProcessEnv = process.env): AuthConfig {
  const secret = environment.JWT_ACCESS_SECRET;

  if (!secret || secret.startsWith("replace-") || Buffer.byteLength(secret) < 32) {
    throw new Error("JWT_ACCESS_SECRET must contain at least 32 bytes.");
  }

  const webOrigin = environment.WEB_ORIGIN;

  if (!webOrigin) {
    throw new Error("WEB_ORIGIN must be set to the frontend origin.");
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(webOrigin);
  } catch {
    throw new Error("WEB_ORIGIN must be a valid absolute URL.");
  }

  if (parsedOrigin.origin !== webOrigin) {
    throw new Error("WEB_ORIGIN must contain only an origin, without a path.");
  }

  const isProduction = environment.NODE_ENV === "production";

  if (isProduction && parsedOrigin.protocol !== "https:") {
    throw new Error("WEB_ORIGIN must use HTTPS in production.");
  }

  return {
    accessTokenAudience: "portflow-web",
    accessTokenIssuer: "portflow-api",
    accessTokenSecret: new TextEncoder().encode(secret),
    accessTokenTtlSeconds: 15 * 60,
    isProduction,
    refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000,
    webOrigin
  };
}
