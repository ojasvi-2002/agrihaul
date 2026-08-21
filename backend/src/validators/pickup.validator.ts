import { z } from "zod";

export const createPickupRequestSchema = z.object({
  farmerId: z.string().trim().min(1),
  farmId: z.string().trim().min(1).optional(),
  product: z.string().trim().min(1).optional(),
  quantity: z.number().positive().optional(),
  unit: z.string().trim().min(1).optional(),
  requestedPickupDate: z.coerce.date().optional(),
  notes: z.string().trim().optional(),
});

export const updatePickupRequestSchema = z.object({
  farmId: z.string().trim().min(1).optional(),
  product: z.string().trim().min(1).optional(),
  quantity: z.number().positive().optional(),
  unit: z.string().trim().min(1).optional(),
  requestedPickupDate: z.coerce.date().optional(),
  notes: z.string().trim().optional(),
  status: z.enum(["PENDING", "CONFIRMED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
});
