import { randomBytes, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { AuthConfig } from "../../config/auth-config.ts";
import { HttpError } from "../../lib/http-error.ts";
import type { AuthRepository } from "./auth.types.ts";
import { AuthService } from "./auth.service.ts";
import { requireAuthentication } from "./auth.middleware.ts";
import { UserService } from "../users/user.service.ts";
import type { UserRepository } from "../users/user.types.ts";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(1).max(128)
});
const changePasswordSchema = z.object({
  password: z.string().min(12).max(128)
}).strict();

const csrfTokenPattern = /^[A-Za-z0-9_-]{43}$/;

function cookieNames(isProduction: boolean): { csrf: string; refresh: string } {
  const prefix = isProduction ? "__Host-" : "";

  return {
    csrf: `${prefix}portflow_csrf`,
    refresh: `${prefix}portflow_refresh`
  };
}

function cookieOptions(config: AuthConfig) {
  return {
    path: "/",
    sameSite: config.isProduction ? ("none" as const) : ("lax" as const),
    secure: config.isProduction
  };
}

function setSessionCookies(
  response: Parameters<RequestHandler>[1],
  refreshToken: string,
  csrfToken: string,
  config: AuthConfig
): void {
  const names = cookieNames(config.isProduction);

  response.cookie(names.refresh, refreshToken, {
    ...cookieOptions(config),
    httpOnly: true,
    maxAge: config.refreshTokenTtlMs
  });
  response.cookie(names.csrf, csrfToken, {
    ...cookieOptions(config),
    httpOnly: false,
    maxAge: config.refreshTokenTtlMs
  });
}

function clearSessionCookies(
  response: Parameters<RequestHandler>[1],
  config: AuthConfig
): void {
  const names = cookieNames(config.isProduction);
  const options = cookieOptions(config);

  response.clearCookie(names.refresh, options);
  response.clearCookie(names.csrf, options);
}

function requireAllowedOrigin(config: AuthConfig): RequestHandler {
  return (request, response, next) => {
    if (request.get("origin") !== config.webOrigin) {
      response.status(403).json({
        error: { code: "ORIGIN_REJECTED", message: "Request origin is not allowed." }
      });
      return;
    }

    next();
  };
}

function requireCsrfToken(config: AuthConfig): RequestHandler {
  const names = cookieNames(config.isProduction);
  const requireOrigin = requireAllowedOrigin(config);

  return (request, response, next) => {
    requireOrigin(request, response, () => {
      const cookieToken = request.cookies?.[names.csrf];
      const headerToken = request.get("x-csrf-token");

      if (
        typeof cookieToken !== "string" ||
        typeof headerToken !== "string" ||
        !csrfTokenPattern.test(cookieToken) ||
        !csrfTokenPattern.test(headerToken)
      ) {
        response.status(403).json({
          error: { code: "CSRF_REJECTED", message: "A valid CSRF token is required." }
        });
        return;
      }

      const cookieBytes = Buffer.from(cookieToken);
      const headerBytes = Buffer.from(headerToken);

      if (!timingSafeEqual(cookieBytes, headerBytes)) {
        response.status(403).json({
          error: { code: "CSRF_REJECTED", message: "A valid CSRF token is required." }
        });
        return;
      }

      next();
    });
  };
}

function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

function loginRateLimitHandler(
  _request: Parameters<RequestHandler>[0],
  response: Parameters<RequestHandler>[1]
): void {
  response.status(429).json({
    error: { code: "RATE_LIMITED", message: "Too many authentication attempts. Try again later." }
  });
}

export function createAuthRouter(
  repository: AuthRepository,
  config: AuthConfig,
  userRepository: UserRepository
): Router {
  const router = Router();
  const service = new AuthService(repository, config);
  const userService = new UserService(userRepository);
  const names = cookieNames(config.isProduction);
  const requireOrigin = requireAllowedOrigin(config);
  const requireCsrf = requireCsrfToken(config);
  const authenticationRequired = requireAuthentication(repository, config);
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: loginRateLimitHandler
  });
  const refreshLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: loginRateLimitHandler
  });

  router.get("/csrf", requireOrigin, (request, response) => {
    const existing = request.cookies?.[names.csrf];
    const csrfToken =
      typeof existing === "string" && csrfTokenPattern.test(existing)
        ? existing
        : createCsrfToken();

    response.set("Cache-Control", "no-store");
    response.cookie(names.csrf, csrfToken, {
      ...cookieOptions(config),
      httpOnly: false,
      maxAge: config.refreshTokenTtlMs
    });
    response.status(200).json({ csrfToken });
  });

  router.post("/login", loginLimiter, requireCsrf, async (request, response) => {
    const credentials = credentialsSchema.parse(request.body);
    const tokens = await service.login(credentials.email, credentials.password);
    const csrfToken = createCsrfToken();

    setSessionCookies(response, tokens.refreshToken, csrfToken, config);
    response.set("Cache-Control", "no-store").status(200).json({
      user: tokens.user,
      accessToken: tokens.accessToken,
      csrfToken
    });
  });

  router.post("/refresh", refreshLimiter, requireCsrf, async (request, response) => {
    const refreshToken = request.cookies?.[names.refresh];

    if (typeof refreshToken !== "string") {
      throw new HttpError(401, "UNAUTHENTICATED", "Session is invalid or expired.");
    }

    const tokens = await service.refresh(refreshToken);
    const csrfToken = createCsrfToken();

    setSessionCookies(response, tokens.refreshToken, csrfToken, config);
    response.set("Cache-Control", "no-store").status(200).json({
      user: tokens.user,
      accessToken: tokens.accessToken,
      csrfToken
    });
  });

  router.post("/logout", requireCsrf, async (request, response) => {
    const refreshToken = request.cookies?.[names.refresh];

    await service.logout(typeof refreshToken === "string" ? refreshToken : undefined);
    clearSessionCookies(response, config);
    response.status(204).end();
  });

  router.post(
    "/password/change",
    authenticationRequired,
    requireCsrf,
    async (request, response) => {
      const user = request.authUser;
      if (!user) {
        throw new HttpError(401, "UNAUTHENTICATED", "Authentication is required.");
      }
      if (!user.mustChangePassword) {
        throw new HttpError(
          409,
          "PASSWORD_CHANGE_NOT_REQUIRED",
          "A password change is not required for this account."
        );
      }

      const { password } = changePasswordSchema.parse(request.body);
      await userService.changeOwnPassword(user.id, password, {
        id: user.id,
        email: user.email
      });

      clearSessionCookies(response, config);
      response.set("Cache-Control", "no-store").status(200).json({ passwordChanged: true });
    }
  );

  router.get("/me", authenticationRequired, (request, response) => {
    const user = request.authUser;

    if (!user) {
      throw new HttpError(401, "UNAUTHENTICATED", "Authentication is required.");
    }

    response.set("Cache-Control", "no-store").status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mustChangePassword: user.mustChangePassword,
        role: user.role.name
      }
    });
  });

  return router;
}
