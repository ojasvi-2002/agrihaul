import { z } from "zod";

export const createDriverSchema = z.object({
  name: z.string().trim().min(1),
  phoneNumber: z.string().trim().min(1),
});

export const updateDriverSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phoneNumber: z.string().trim().min(1).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
