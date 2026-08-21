import { Request, Response } from "express";
import * as messageService from "../services/message.service";
import { notFound } from "../utils/httpErrors";
import { idParam } from "../utils/params";

export async function getMessage(req: Request, res: Response) {
  const message = await messageService.getMessage(req.user!.organizationId, idParam(req));
  if (!message) return notFound(res, "Message");
  res.json({ message });
}
