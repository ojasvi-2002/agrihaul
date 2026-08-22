import { Request, Response } from "express";
import { env } from "../config/env";
import * as impersonationService from "../services/impersonation.service";
import { listImpersonationLogsForOrg } from "../repositories/impersonationLog.repository";
import { idParam } from "../utils/params";

export async function postStartImpersonation(req: Request, res: Response) {
  const rawToken = req.signedCookies[env.sessionCookieName];
  await impersonationService.startImpersonation(
    req.user!.organizationId,
    req.user!.id,
    req.user!.role,
    idParam(req),
    rawToken,
  );
  res.status(204).send();
}

export async function postStopImpersonation(req: Request, res: Response) {
  const rawToken = req.signedCookies[env.sessionCookieName];
  await impersonationService.stopImpersonation(rawToken);
  res.status(204).send();
}

export async function getImpersonationLogs(req: Request, res: Response) {
  const logs = await listImpersonationLogsForOrg(req.user!.organizationId);
  res.json({
    logs: logs.map((l) => ({
      id: l.id,
      admin: l.admin,
      target: l.target,
      startedAt: l.startedAt,
      endedAt: l.endedAt,
    })),
  });
}
