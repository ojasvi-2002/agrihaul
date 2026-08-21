import { z } from "zod";

export const createFarmerSchema = z.object({
  name: z.string().trim().min(1),
  phoneNumber: z.string().trim().min(1),
});

export const updateFarmerSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phoneNumber: z.string().trim().min(1).optional(),
});
