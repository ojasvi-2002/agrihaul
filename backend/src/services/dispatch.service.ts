import { findPickupRequestById } from "../repositories/pickupRequest.repository";
import { findFarmById } from "../repositories/farm.repository";
import { findFarmerById } from "../repositories/farmer.repository";
import { findDriverById } from "../repositories/driver.repository";
import { findVehicleById, findVehicleByPrimaryDriverId, updateVehicleLocation } from "../repositories/vehicle.repository";
import {
  createAssignmentAtomic,
  findActiveAssignmentForPickup,
  findActiveAssignmentForDriver,
  RaceLostError,
} from "../repositories/assignment.repository";
import { findOpenConversationForFarmer, createConversation } from "../repositories/conversation.repository";
import { recommendNearestVehicles, RecommendationResult } from "../modules/dispatch/recommendation";
import { broadcastPickupToDrivers } from "../modules/dispatch/broadcast";
import { parseDriverMessage } from "../modules/dispatch/driverMessageParser";
import { sendSms } from "../integrations/twilio/client";
import { createOutboundMessage } from "./message.service";
import { updatePickupRequest } from "./pickupRequest.service";
import { findActivePhoneNumber } from "../repositories/organizationPhoneNumber.repository";
import { ServiceError } from "../utils/serviceErrors";

export async function getRecommendation(
  organizationId: string,
  pickupId: string,
): Promise<RecommendationResult | null> {
  const pickup = await findPickupRequestById(organizationId, pickupId);
  if (!pickup) return null;

  const farm = pickup.farmId ? await findFarmById(organizationId, pickup.farmId) : null;
  const location =
    farm?.latitude != null && farm?.longitude != null
      ? { latitude: farm.latitude, longitude: farm.longitude }
      : null;

  return recommendNearestVehicles(organizationId, location);
}

export async function broadcastToDrivers(organizationId: string, pickupId: string) {
  const pickup = await findPickupRequestById(organizationId, pickupId);
  if (!pickup) return null;

  return broadcastPickupToDrivers(organizationId, {
    product: pickup.product,
    quantity: pickup.quantity,
    unit: pickup.unit,
    locationText: pickup.locationText,
  });
}

// Reuses the pickup's originating conversation when it has one (i.e. it
// came from an inbound SMS); otherwise finds-or-opens the farmer's
// conversation, same fallback the Twilio webhook uses.
async function resolveFarmerConversationId(
  organizationId: string,
  farmerId: string,
  sourceConversationId: string | null,
): Promise<string> {
  if (sourceConversationId) return sourceConversationId;
  const conversation =
    (await findOpenConversationForFarmer(organizationId, farmerId)) ??
    (await createConversation(organizationId, farmerId));
  return conversation.id;
}

async function notifyFarmer(organizationId: string, farmerId: string, sourceConversationId: string | null, body: string) {
  const conversationId = await resolveFarmerConversationId(organizationId, farmerId, sourceConversationId);
  await createOutboundMessage(organizationId, conversationId, body);
}

// The dispatcher always has the final say — this is called whether the
// chosen driver/vehicle came from the recommendation or a manual pick.
export async function assignPickup(
  organizationId: string,
  pickupId: string,
  driverId: string,
  vehicleId: string,
) {
  const pickup = await findPickupRequestById(organizationId, pickupId);
  if (!pickup) return null;
  // Fast, friendly pre-checks for the common (non-race) case — the
  // atomic claim below is what actually enforces correctness even when
  // two requests land at the same instant.
  if (!["PENDING", "CONFIRMED"].includes(pickup.status)) {
    throw new ServiceError(400, `Pickup request is already ${pickup.status.toLowerCase()}`);
  }

  const driver = await findDriverById(organizationId, driverId);
  if (!driver) throw new ServiceError(400, "driverId does not refer to a driver in your organization");

  const vehicle = await findVehicleById(organizationId, vehicleId);
  if (!vehicle) throw new ServiceError(400, "vehicleId does not refer to a vehicle in your organization");
  if (vehicle.status !== "AVAILABLE") {
    throw new ServiceError(400, "That vehicle is not currently available");
  }

  const existing = await findActiveAssignmentForPickup(organizationId, pickupId);
  if (existing) throw new ServiceError(400, "This pickup request is already assigned");

  let assignment;
  try {
    assignment = await createAssignmentAtomic(organizationId, pickupId, driverId, vehicleId);
  } catch (err) {
    if (err instanceof RaceLostError) throw new ServiceError(409, err.message);
    throw err;
  }

  const farmer = await findFarmerById(organizationId, pickup.farmerId);
  const farm = pickup.farmId ? await findFarmById(organizationId, pickup.farmId) : null;
  const orgPhone = await findActivePhoneNumber(organizationId);
  const jobDescription = [
    pickup.product,
    pickup.quantity != null && pickup.unit ? `${pickup.quantity}${pickup.unit}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const location = farm?.address || pickup.locationText || "the farmer's location";

  if (orgPhone) {
    const dispatchBody = `DISPATCH: Go to ${location}. Collect ${jobDescription || "the produce"} from ${farmer?.name ?? "the farmer"}.`;
    await sendSms(driver.phoneNumber, orgPhone.twilioPhoneNumber, dispatchBody);
  }

  // Closes the loop on the farmer's side too — they asked for a pickup,
  // they should hear that a truck is actually coming.
  if (farmer) {
    const firstName = farmer.name.split(" ")[0];
    await notifyFarmer(
      organizationId,
      pickup.farmerId,
      pickup.sourceConversationId,
      `Confirmed ${firstName}. A truck is on the way. Driver: ${driver.name}.`,
    );
  }

  return assignment;
}

export type DriverMessageResult =
  | { action: "locationUpdated"; vehicleId: string }
  | { action: "noVehicle" }
  | { action: "completed"; pickupRequestId: string }
  | { action: "noActiveAssignment" }
  | { action: "unrecognized" };

// Orchestrates a driver-side SMS command (see driverMessageParser.ts for
// the pure parsing). Called from twilioWebhook.service.ts once the
// sender is identified as a driver, not a farmer.
export async function handleDriverMessage(
  organizationId: string,
  driverId: string,
  body: string,
): Promise<DriverMessageResult> {
  const command = parseDriverMessage(body);

  if (command.type === "LOC") {
    const vehicle = await findVehicleByPrimaryDriverId(organizationId, driverId);
    if (!vehicle) return { action: "noVehicle" };
    await updateVehicleLocation(vehicle.id, {
      latitude: command.latitude,
      longitude: command.longitude,
      source: "SMS_REPORTED",
    });
    return { action: "locationUpdated", vehicleId: vehicle.id };
  }

  if (command.type === "DONE") {
    const assignment = await findActiveAssignmentForDriver(organizationId, driverId);
    if (!assignment) return { action: "noActiveAssignment" };

    // Reuses the same COMPLETED side effects PATCH /api/pickups/:id
    // triggers (frees the vehicle, closes the assignment) — one place
    // owns "what completing a pickup means", whether a dispatcher or a
    // driver's SMS is what triggered it.
    await updatePickupRequest(organizationId, assignment.pickupRequestId, { status: "COMPLETED" });

    const pickup = await findPickupRequestById(organizationId, assignment.pickupRequestId);
    if (pickup) {
      await notifyFarmer(
        organizationId,
        pickup.farmerId,
        pickup.sourceConversationId,
        "Your pickup has been completed. Thank you!",
      );
    }

    return { action: "completed", pickupRequestId: assignment.pickupRequestId };
  }

  return { action: "unrecognized" };
}
