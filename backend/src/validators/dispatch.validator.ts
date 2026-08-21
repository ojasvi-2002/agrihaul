import { z } from "zod";

export const assignPickupSchema = z.object({
  driverId: z.string().trim().min(1),
  vehicleId: z.string().trim().min(1),
});
