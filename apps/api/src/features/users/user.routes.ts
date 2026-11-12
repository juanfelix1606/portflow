import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import type { AuthConfig } from "../../config/auth-config.ts";
import type { AuthRepository } from "../auth/auth.types.ts";
import { requireAuthentication, requireRoles } from "../auth/auth.middleware.ts";
import { HttpError } from "../../lib/http-error.ts";
import type { UpdateUserInput, UserListFilters, UserRepository } from "./user.types.ts";
import { UserService } from "./user.service.ts";
import { sendCsv } from "../../lib/csv.ts";

const roleNames = ["ADMIN", "GATE_OPERATOR", "YARD_OPERATOR"] as const;
const roleSchema = z.enum(roleNames);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
  role: roleSchema.optional(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true").optional()
}).strict();
const exportQuerySchema = listQuerySchema.omit({ page: true, limit: true });

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(12).max(128),
  role: roleSchema
}).strict();

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: roleSchema.optional(),
  isActive: z.boolean().optional()
}).strict().refine(
  (value) =>
    value.name !== undefined ||
    value.role !== undefined ||
    value.isActive !== undefined,
  { message: "At least one field must be provided." }
);
const resetPasswordSchema = z.object({
  password: z.string().min(12).max(128)
}).strict();

function getActor(request: Request) {
  const user = request.authUser;

  if (!user) {
    throw new HttpError(401, "UNAUTHENTICATED", "Authentication is required.");
  }

  return { id: user.id, email: user.email };
}

export function createUserRouter(
  repository: UserRepository,
  authRepository: AuthRepository,
  authConfig: AuthConfig
): Router {
  const router = Router();
  const service = new UserService(repository);

  router.use(
    requireAuthentication(authRepository, authConfig),
    requireRoles("ADMIN")
  );

  router.get("/export", async (request, response) => {
    const parsed = exportQuerySchema.parse(request.query);
    const filters = {
      ...(parsed.search !== undefined ? { search: parsed.search } : {}),
      ...(parsed.role !== undefined ? { role: parsed.role } : {}),
      ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {})
    };

    async function* rows(): AsyncGenerator<readonly string[]> {
      const batchSize = 500;
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages) {
        const result = await service.list({ ...filters, page, limit: batchSize });
        totalPages = result.pagination.totalPages;
        for (const user of result.data) {
          yield [
            user.id,
            user.name,
            user.email,
            user.role,
            String(user.isActive),
            user.createdAt.toISOString(),
            user.updatedAt.toISOString()
          ];
        }
        page += 1;
      }
    }

    await sendCsv(
      response,
      "portflow-managed-users.csv",
      ["userId", "name", "email", "role", "isActive", "createdAt", "updatedAt"],
      rows()
    );
  });

  router.get("/", async (request, response) => {
    const parsed = listQuerySchema.parse(request.query);
    const filters: UserListFilters = {
      page: parsed.page,
      limit: parsed.limit,
      ...(parsed.search !== undefined ? { search: parsed.search } : {}),
      ...(parsed.role !== undefined ? { role: parsed.role } : {}),
      ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {})
    };
    const result = await service.list(filters);

    response.set("Cache-Control", "no-store").status(200).json(result);
  });

  router.post("/", async (request, response) => {
    const input = createUserSchema.parse(request.body);
    const user = await service.create(input, getActor(request));

    response.status(201).json({ user });
  });

  router.patch("/:userId/password", async (request, response) => {
    const userId = z.string().min(1).max(30).parse(request.params.userId);
    const { password } = resetPasswordSchema.parse(request.body);

    await service.resetPassword(userId, password, getActor(request));

    response.set("Cache-Control", "no-store").status(200).json({ reset: true });
  });

  router.patch("/:userId", async (request, response) => {
    const userId = z.string().min(1).max(30).parse(request.params.userId);
    const parsed = updateUserSchema.parse(request.body);
    const input: UpdateUserInput = {
      ...(parsed.name !== undefined ? { name: parsed.name } : {}),
      ...(parsed.role !== undefined ? { role: parsed.role } : {}),
      ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {})
    };
    const user = await service.update(userId, input, getActor(request));

    response.status(200).json({ user });
  });

  return router;
}
