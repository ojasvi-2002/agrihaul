import { Request, Response } from "express";
import * as teamService from "../services/team.service";
import { inviteUserSchema } from "../validators/team.validator";
import { sendError } from "../utils/httpErrors";

export async function listTeam(req: Request, res: Response) {
  const users = await teamService.listTeam(req.user!.organizationId);
  res.json({ users });
}

export async function inviteUser(req: Request, res: Response) {
  const parsed = inviteUserSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid user data");

  const user = await teamService.inviteUser(req.user!.organizationId, req.user!.role, parsed.data);
  res.status(201).json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
