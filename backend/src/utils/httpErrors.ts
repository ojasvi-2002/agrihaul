import { Response } from "express";

export function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ error: { message } });
}

// A resource that exists but belongs to another organization is reported
// identically to one that doesn't exist at all — never reveal cross-tenant
// existence (CLAUDE.md §22-24).
export function notFound(res: Response, what = "Resource") {
  sendError(res, 404, `${what} not found`);
}
