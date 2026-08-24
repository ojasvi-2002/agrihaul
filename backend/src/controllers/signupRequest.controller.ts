import { Request, Response } from "express";
import * as signupRequestService from "../services/signupRequest.service";
import { signupRequestSchema } from "../validators/signupRequest.validator";
import { sendError } from "../utils/httpErrors";
import { idParam } from "../utils/params";

// Public — no session yet, this is what creates the eventual account.
export async function postSignupRequest(req: Request, res: Response) {
  const parsed = signupRequestSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid signup request");

  await signupRequestService.submitSignupRequest(parsed.data);
  res.status(201).json({ ok: true });
}

// Everything below requires requirePlatformAdminAuth (enforced in routes).
export async function listSignupRequests(req: Request, res: Response) {
  const requests = await signupRequestService.listSignupRequests();
  res.json({ requests });
}

export async function postApproveSignupRequest(req: Request, res: Response) {
  const organization = await signupRequestService.approveSignupRequest(idParam(req));
  res.json({ organization });
}

export async function postRejectSignupRequest(req: Request, res: Response) {
  await signupRequestService.rejectSignupRequest(idParam(req));
  res.status(204).send();
}
