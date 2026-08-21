import { z } from "zod";

export const createVehicleSchema = z.object({
  name: z.string().trim().min(1),
  registrationNumber: z.string().trim().min(1),
  capacity: z.number().positive().optional(),
  primaryDriverId: z.string().trim().min(1).optional(),
});

export const updateVehicleSchema = z.object({
  name: z.string().trim().min(1).optional(),
  registrationNumber: z.string().trim().min(1).optional(),
  capacity: z.number().positive().optional(),
  primaryDriverId: z.string().trim().min(1).nullable().optional(),
  status: z.enum(["AVAILABLE", "EN_ROUTE", "MAINTENANCE", "INACTIVE"]).optional(),
});
