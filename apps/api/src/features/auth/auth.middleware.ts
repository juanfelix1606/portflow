import type { RequestHandler } from "express";
import type { RoleName } from "../../generated/prisma/client.ts";
import type { AuthConfig } from "../../config/auth-config.ts";
import type { AuthRepository } from "./auth.types.ts";
import { verifyAccessToken } from "./tokens.ts";

function unauthorized(response: Parameters<RequestHandler>[1]): void {
  response.status(401).json({
    error: { code: "UNAUTHENTICATED", message: "Authentication is required." }
  });
}

export function requireAuthentication(
  repository: AuthRepository,
  config: AuthConfig
): RequestHandler {
  return async (request, response, next) => {
    const match = /^Bearer\s+([^\s]+)$/i.exec(request.get("authorization") ?? "");

    if (!match?.[1]) {
      unauthorized(response);
      return;
    }

    const claims = await verifyAccessToken(match[1], config);

    if (!claims) {
      unauthorized(response);
      return;
    }

    const user = await repository.findUserById(claims.userId);

    if (!user || !user.isActive || user.authVersion !== claims.authVersion) {
      unauthorized(response);
      return;
    }

    const isPasswordChangeRequest =
      request.baseUrl === "/api/v1/auth" &&
      request.method === "POST" &&
      request.path === "/password/change";
    if (user.mustChangePassword && !isPasswordChangeRequest) {
      response.status(403).json({
        error: {
          code: "PASSWORD_CHANGE_REQUIRED",
          message: "Change your password before continuing."
        }
      });
      return;
    }

    request.authUser = user;
    next();
  };
}

export function requireRoles(...roles: RoleName[]): RequestHandler {
  return (request, response, next) => {
    if (!request.authUser) {
      unauthorized(response);
      return;
    }

    if (!roles.includes(request.authUser.role.name)) {
      response.status(403).json({
        error: { code: "FORBIDDEN", message: "You do not have permission to perform this action." }
      });
      return;
    }

    next();
  };
}
