import { z } from "zod";

export const createFarmSchema = z.object({
  farmerId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  address: z.string().trim().min(1).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export const updateFarmSchema = z.object({
  name: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});
