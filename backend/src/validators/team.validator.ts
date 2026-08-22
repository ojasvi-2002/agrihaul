import { z } from "zod";

export const inviteUserSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  // Drivers never get a platform login (see UserRole in schema.prisma) —
  // only these three are ever invite-able.
  role: z.enum(["OWNER", "ADMIN", "DISPATCHER"]),
});

export const acceptInviteSchema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
