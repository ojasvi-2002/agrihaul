import { z } from "zod";

export const signupSchema = z.object({
  organizationName: z.string().trim().min(1),
  ownerName: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
