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
        // Set only while the actual session owner (an OWNER/ADMIN) is
        // "viewing as" this user in View-as mode. `req.user` above is
        // always the effective (possibly impersonated) user; this field
        // identifies who is REALLY signed in — for the frontend's
        // "Viewing as X" banner and for authorization checks that must
        // never be reachable via impersonation (e.g. starting/stopping
        // impersonation itself).
        impersonatedBy?: { id: string; name: string; email: string; role: UserRole } | null;
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
