import { z } from "zod";

const e164 = z.string().trim().regex(/^\+[1-9]\d{6,14}$/, "Must be in +<countrycode> format (E.164)");

export const createPhoneNumberSchema = z.object({
  twilioPhoneNumber: e164,
  friendlyName: z.string().trim().min(1).optional(),
});

export const updatePhoneNumberSchema = z.object({
  friendlyName: z.string().trim().min(1).optional(),
  active: z.boolean().optional(),
});
