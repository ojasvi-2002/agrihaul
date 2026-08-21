// CLAUDE.md Phase 14 — realtime. Deliberately the simplest thing that
// works: an in-memory map of open SSE response streams, kept per
// organization so a broadcast can never cross a tenant boundary (CLAUDE.md
// §22). No Redis, no pub/sub, no message broker — this is a single-process
// modular monolith (§45), and a broadcast only ever needs to reach clients
// connected to *this* process. Revisit only if the backend ever needs to
// run as more than one instance.
import { Response } from "express";

const subscribersByOrg = new Map<string, Map<number, Response>>();
let nextClientId = 1;

export function subscribe(organizationId: string, res: Response): number {
  const clientId = nextClientId++;
  if (!subscribersByOrg.has(organizationId)) {
    subscribersByOrg.set(organizationId, new Map());
  }
  subscribersByOrg.get(organizationId)!.set(clientId, res);
  return clientId;
}

export function unsubscribe(organizationId: string, clientId: number) {
  const orgSubscribers = subscribersByOrg.get(organizationId);
  if (!orgSubscribers) return;
  orgSubscribers.delete(clientId);
  if (orgSubscribers.size === 0) subscribersByOrg.delete(organizationId);
}

// Never sends across organizations — the caller passes the organizationId
// whose data actually changed, and only that org's connected clients can
// possibly be subscribed under it.
export function broadcast(organizationId: string, event: string, data: unknown) {
  const orgSubscribers = subscribersByOrg.get(organizationId);
  if (!orgSubscribers) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of orgSubscribers.values()) {
    res.write(payload);
  }
}

export function subscriberCount(organizationId: string): number {
  return subscribersByOrg.get(organizationId)?.size ?? 0;
}
