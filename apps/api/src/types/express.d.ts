import type { AuthUser } from "../features/auth/auth.types.ts";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export {};
