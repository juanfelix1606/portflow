import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import type { AuthConfig } from "../../config/auth-config.ts";
import { requireAuthentication, requireRoles } from "../auth/auth.middleware.ts";
import type { AuthRepository } from "../auth/auth.types.ts";
import { sendCsv } from "../../lib/csv.ts";
import { HttpError } from "../../lib/http-error.ts";
import type { UpdateYardInput, YardActor, YardRepository } from "./yard.types.ts";

const placeContainerSchema = z.object({
  containerId: z.string().trim().min(1).max(30),
  yardCode: z.string().trim().toUpperCase().min(1).max(40)
}).strict();
const relocateContainerSchema = placeContainerSchema;
const updateYardSchema = z.object({
  capacity: z.number().int().min(1).max(2_147_483_647).optional(),
  isActive: z.boolean().optional()
}).strict().refine(
  (value) => value.capacity !== undefined || value.isActive !== undefined,
  { message: "At least one field must be provided." }
);

function getActor(request: Request): YardActor {
  const user = request.authUser;

  if (!user) {
    throw new HttpError(401, "UNAUTHENTICATED", "Authentication is required.");
  }

  return { id: user.id, email: user.email };
}

export function createYardRouter(
  repository: YardRepository,
  authRepository: AuthRepository,
  authConfig: AuthConfig
): Router {
  const router = Router();

  router.get(
    "/export",
    requireAuthentication(authRepository, authConfig),
    requireRoles("ADMIN"),
    async (_request, response) => {
      const yards = await repository.listYards();

      async function* rows(): AsyncGenerator<readonly string[]> {
        for (const yard of yards) {
          yield [
            yard.zone,
            yard.code,
            String(yard.capacity),
            String(yard.occupied),
            String(yard.capacity - yard.occupied),
            String(yard.isActive),
            ((yard.occupied / yard.capacity) * 100).toFixed(2)
          ];
        }
      }

      await sendCsv(
        response,
        "portflow-yard-occupancy.csv",
        ["zone", "yardCode", "capacity", "occupied", "available", "isActive", "utilizationPercent"],
        rows()
      );
    }
  );

  router.get(
    "/",
    requireAuthentication(authRepository, authConfig),
    requireRoles("ADMIN"),
    async (_request, response) => {
      const data = await repository.listYards();

      response.set("Cache-Control", "no-store").status(200).json({ data });
    }
  );

  router.patch(
    "/:yardId",
    requireAuthentication(authRepository, authConfig),
    requireRoles("ADMIN"),
    async (request, response) => {
      const yardId = z.string().min(1).max(30).parse(request.params.yardId);
      const parsed = updateYardSchema.parse(request.body);
      const input: UpdateYardInput = {
        ...(parsed.capacity !== undefined ? { capacity: parsed.capacity } : {}),
        ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {})
      };
      const yard = await repository.updateYard(yardId, input, getActor(request));

      response.status(200).json({ yard });
    }
  );

  router.post(
    "/placement",
    requireAuthentication(authRepository, authConfig),
    requireRoles("ADMIN", "YARD_OPERATOR"),
    async (request, response) => {
      const input = placeContainerSchema.parse(request.body);
      const result = await repository.place(input, getActor(request));

      response.status(201).json(result);
    }
  );

  router.post(
    "/relocation",
    requireAuthentication(authRepository, authConfig),
    requireRoles("ADMIN", "YARD_OPERATOR"),
    async (request, response) => {
      const input = relocateContainerSchema.parse(request.body);
      const result = await repository.relocate(input, getActor(request));

      response.status(201).json(result);
    }
  );

  return router;
}
