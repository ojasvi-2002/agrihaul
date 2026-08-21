import { Request, Response } from "express";
import * as teamService from "../services/team.service";
import { respondWithSession } from "./auth.controller";
import { inviteUserSchema, acceptInviteSchema } from "../validators/team.validator";
import { sendError, notFound } from "../utils/httpErrors";
import { idParam } from "../utils/params";

export async function listTeam(req: Request, res: Response) {
  const users = await teamService.listTeam(req.user!.organizationId);
  res.json({ users });
}

export async function listPendingInvites(req: Request, res: Response) {
  const invites = await teamService.listPendingInvites(req.user!.organizationId);
  res.json({
    invites: invites.map((i) => ({
      id: i.id,
      name: i.name,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    })),
  });
}

export async function inviteUser(req: Request, res: Response) {
  const parsed = inviteUserSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid user data");

  const invite = await teamService.createInvite(
    req.user!.organizationId,
    req.user!.id,
    req.user!.role,
    parsed.data,
  );
  res.status(201).json({
    invite: { id: invite.id, name: invite.name, email: invite.email, role: invite.role, expiresAt: invite.expiresAt },
  });
}

export async function revokeInvite(req: Request, res: Response) {
  const revoked = await teamService.revokeInvite(req.user!.organizationId, idParam(req));
  if (!revoked) return notFound(res, "Invite");
  res.status(204).send();
}

// Public (no auth) — the invitee has no session yet.
export async function getInvitePreview(req: Request, res: Response) {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) return sendError(res, 400, "Missing invite token");

  const preview = await teamService.getInvitePreview(token);
  if (!preview) return sendError(res, 400, "This invite link is invalid or has expired");
  res.json(preview);
}

// Public (no auth) — accepting the invite is what creates the session.
export async function acceptInvite(req: Request, res: Response) {
  const parsed = acceptInviteSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid data");

  const result = await teamService.acceptInvite(parsed.data.token, parsed.data.password);
  respondWithSession(res, result, 201);
}
