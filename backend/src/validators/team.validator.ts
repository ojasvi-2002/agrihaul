import { z } from "zod";

export const inviteUserSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["OWNER", "ADMIN", "DISPATCHER", "DRIVER"]),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
