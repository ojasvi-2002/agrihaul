import { Request, Response } from "express";
import { subscribe, unsubscribe } from "../modules/realtime/hub";

// Keeps intermediary proxies/load balancers (and some browsers) from
// treating the idle connection as dead and silently closing it.
const HEARTBEAT_MS = 25_000;

// GET /api/realtime/events (requireAuth) — a long-lived Server-Sent
// Events stream, one per connected browser tab. Scoped to the caller's
// own organization only (never trusts anything from the client for that
// — req.user.organizationId comes from the authenticated session).
export function streamEvents(req: Request, res: Response) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  const organizationId = req.user!.organizationId;
  const clientId = subscribe(organizationId, res);

  // A leading comment line (SSE comments start with ":") forces the
  // response to actually flush now, rather than a proxy holding it open
  // with zero bytes sent until the first real event.
  res.write(": connected\n\n");

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe(organizationId, clientId);
  });
}
