import { z } from "zod";

// No password here — the requester doesn't set one until their request
// is approved and they follow the emailed invite link (same flow as a
// normal team invite).
export const signupRequestSchema = z.object({
  organizationName: z.string().trim().min(1),
  ownerName: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
});
