import { parseIncomingSms } from "./parser";
import { listFarmsForFarmer } from "../../repositories/farm.repository";
import { updateFarmer } from "../../repositories/farmer.repository";
import {
  findPendingPickupForFarmer,
  findCancellablePickupForFarmer,
  createPickupRequest,
  updatePickupRequest,
} from "../../repositories/pickupRequest.repository";
import { setNeedsReview } from "../../repositories/message.repository";

type FarmCandidate = { id: string; name: string; address: string | null };

// Auto-links a farm when the parsed location text clearly matches one of
// the farmer's known farms — never invents a farm when it doesn't (§29).
// Exact name matches are checked across every farm before any substring
// match is considered, so array order can never let a shorter farm's
// name (a substring of a longer one, e.g. "North Farm" inside "North
// Farm Extension") win over the actual exact match.
function matchFarm(farms: FarmCandidate[], location: string): FarmCandidate | null {
  const loc = location.toLowerCase();

  const exact = farms.find((f) => f.name.toLowerCase() === loc);
  if (exact) return exact;

  return (
    farms.find(
      (f) =>
        loc.includes(f.name.toLowerCase()) ||
        (f.address && (f.address.toLowerCase().includes(loc) || loc.includes(f.address.toLowerCase()))),
    ) ?? null
  );
}

export type ProcessResult =
  | { action: "none" }
  | { action: "needsReview"; issues: string[] }
  | { action: "cancelled"; pickupRequestId: string }
  | { action: "created"; pickupRequestId: string }
  | { action: "corrected"; pickupRequestId: string };

// CLAUDE.md §28's "Parse message → Determine intent → Extract structured
// fields → Validate → Create/update pickup if confident" — called once per
// newly-stored inbound message (the caller is responsible for not
// re-running this on an idempotent duplicate-webhook no-op).
export async function processIncomingMessage(params: {
  organizationId: string;
  farmerId: string;
  farmerName: string;
  farmerPhoneNumber: string;
  conversationId: string;
  messageId: string;
  body: string;
}): Promise<ProcessResult> {
  // No referenceDate passed — TODAY/TOMORROW/weekday resolution in
  // extractDate falls back to the server process's own local clock, with
  // no per-organization timezone conversion. Organization.timezone is
  // listed in CLAUDE.md §12 as a potential future field, not yet built;
  // this is that same known gap, not a separate oversight. A farmer
  // texting near midnight in a different timezone than the server could
  // get a requestedPickupDate off by one day.
  const result = parseIncomingSms(params.body);

  if (result.intent === "IRRELEVANT") {
    return { action: "none" };
  }

  if (result.intent === "CANCEL") {
    const pickup = await findCancellablePickupForFarmer(params.organizationId, params.farmerId);
    if (!pickup) return { action: "none" };
    await updatePickupRequest(params.organizationId, pickup.id, { status: "CANCELLED" });
    return { action: "cancelled", pickupRequestId: pickup.id };
  }

  if (!result.confident) {
    await setNeedsReview(params.messageId, true);
    return { action: "needsReview", issues: result.issues };
  }

  // Phase 6 creates unknown farmers with their phone number as a
  // placeholder name. If they've now texted their real name, use it —
  // it's literally what they typed, not invented (§29). Keyword-mode
  // parses (parser.ts's parseByKeyword) never populate `name` at all —
  // no reliable way to isolate it from filler words like "Hey its
  // Kwame" — so there's nothing to fill in from those messages.
  if (
    result.fields.name &&
    params.farmerName === params.farmerPhoneNumber &&
    result.fields.name !== params.farmerPhoneNumber
  ) {
    await updateFarmer(params.organizationId, params.farmerId, { name: result.fields.name });
  }

  const farms = await listFarmsForFarmer(params.organizationId, params.farmerId);
  const matchedFarm = matchFarm(farms, result.fields.location);

  // A second confidently-parsed message while one is still PENDING is
  // treated as a correction to it, not a separate new request.
  const pending = await findPendingPickupForFarmer(params.organizationId, params.farmerId);
  if (pending) {
    await updatePickupRequest(params.organizationId, pending.id, {
      farmId: matchedFarm?.id,
      sourceConversationId: params.conversationId,
      sourceMessageId: params.messageId,
      product: result.fields.product,
      locationText: result.fields.location,
      quantity: result.fields.quantity,
      unit: result.fields.unit,
      requestedPickupDate: result.fields.requestedPickupDate ?? undefined,
    });
    return { action: "corrected", pickupRequestId: pending.id };
  }

  const created = await createPickupRequest(params.organizationId, {
    farmerId: params.farmerId,
    farmId: matchedFarm?.id,
    locationText: result.fields.location,
    sourceConversationId: params.conversationId,
    sourceMessageId: params.messageId,
    product: result.fields.product,
    quantity: result.fields.quantity,
    unit: result.fields.unit,
    requestedPickupDate: result.fields.requestedPickupDate ?? undefined,
  });
  return { action: "created", pickupRequestId: created.id };
}
