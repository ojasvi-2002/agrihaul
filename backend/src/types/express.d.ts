import type { UserRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        organizationId: string;
        role: UserRole;
        name: string;
        email: string;
        organization: { id: string; name: string; slug: string };
      };
      // Populated by requirePlatformAdminAuth — a wholly separate realm
      // from `user` above (see PlatformAdmin in schema.prisma).
      platformAdmin?: {
        id: string;
        name: string;
        email: string;
      };
    }
  }
}

export {};
