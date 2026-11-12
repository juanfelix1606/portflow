import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import type { ErrorRequestHandler } from "express";
import helmet from "helmet";
import { ZodError } from "zod";
import type { AuthConfig } from "./config/auth-config.ts";
import { createAuthRouter } from "./features/auth/auth.routes.ts";
import type { AuthRepository } from "./features/auth/auth.types.ts";
import { HttpError } from "./lib/http-error.ts";
import { createUserRouter } from "./features/users/user.routes.ts";
import type { UserRepository } from "./features/users/user.types.ts";
import { createContainerRouter } from "./features/containers/container.routes.ts";
import type { ContainerRepository } from "./features/containers/container.types.ts";
import { createGateRouter } from "./features/gate/gate.routes.ts";
import type { GateRepository } from "./features/gate/gate.types.ts";
import { createYardRouter } from "./features/yard/yard.routes.ts";
import type { YardRepository } from "./features/yard/yard.types.ts";
import { createDashboardRouter } from "./features/dashboard/dashboard.routes.ts";
import type { DashboardRepository } from "./features/dashboard/dashboard.types.ts";
import { createAuditRouter } from "./features/audit/audit.routes.ts";
import type { AuditRepository } from "./features/audit/audit.types.ts";

interface AppDependencies {
  authConfig: AuthConfig;
  authRepository: AuthRepository;
  userRepository: UserRepository;
  containerRepository: ContainerRepository;
  gateRepository: GateRepository;
  yardRepository: YardRepository;
  dashboardRepository: DashboardRepository;
  auditRepository: AuditRepository;
}

const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (typeof error === "object" && error !== null && "type" in error) {
    if (error.type === "entity.parse.failed") {
      response.status(400).json({
        error: { code: "INVALID_JSON", message: "Request body must contain valid JSON." }
      });
      return;
    }

    if (error.type === "entity.too.large") {
      response.status(413).json({
        error: { code: "PAYLOAD_TOO_LARGE", message: "Request body exceeds the allowed size." }
      });
      return;
    }
  }

  if (error instanceof HttpError) {
    response.status(error.statusCode).json({
      error: { code: error.code, message: error.message }
    });
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Request validation failed.",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      }
    });
    return;
  }

  console.error("Unhandled API error", error);
  response.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." }
  });
};

export function createApp({
  authConfig,
  authRepository,
  userRepository,
  containerRepository,
  gateRepository,
  yardRepository,
  dashboardRepository,
  auditRepository
}: AppDependencies) {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: authConfig.webOrigin,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
      methods: ["GET", "POST", "PATCH", "OPTIONS"]
    })
  );
  app.use(express.json({ limit: "16kb" }));
  app.use(cookieParser());

  app.get("/api/v1/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });
  app.use("/api/v1/auth", createAuthRouter(authRepository, authConfig, userRepository));
  app.use(
    "/api/v1/users",
    createUserRouter(userRepository, authRepository, authConfig)
  );
  app.use(
    "/api/v1/containers",
    createContainerRouter(containerRepository, authRepository, authConfig)
  );
  app.use(
    "/api/v1/gate",
    createGateRouter(gateRepository, authRepository, authConfig)
  );
  app.use(
    "/api/v1/yard",
    createYardRouter(yardRepository, authRepository, authConfig)
  );
  app.use(
    "/api/v1/dashboard",
    createDashboardRouter(dashboardRepository, authRepository, authConfig)
  );
  app.use(
    "/api/v1/audit",
    createAuditRouter(auditRepository, authRepository, authConfig)
  );
  app.use((_request, response) => {
    response.status(404).json({
      error: { code: "NOT_FOUND", message: "The requested resource was not found." }
    });
  });
  app.use(errorHandler);

  return app;
}
