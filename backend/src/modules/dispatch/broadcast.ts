import { sendSms } from "../../integrations/twilio/client";
import { listAvailableVehiclesWithDriver } from "../../repositories/vehicle.repository";
import { findActivePhoneNumber } from "../../repositories/organizationPhoneNumber.repository";

// The no-GPS tier of the dispatch model: ping every available truck's
// driver with the job, and let them reply "LOC <lat> <lon>" if they can
// take it. This is a one-way informational text — not persisted as a
// Message, since the Conversation/Message model is farmer-only (§16).
export async function broadcastPickupToDrivers(
  organizationId: string,
  pickup: { product: string | null; quantity: number | null; unit: string | null; locationText: string | null },
): Promise<{ sentTo: number }> {
  const orgPhone = await findActivePhoneNumber(organizationId);
  if (!orgPhone) return { sentTo: 0 };

  const vehicles = await listAvailableVehiclesWithDriver(organizationId);

  const jobDescription = [
    pickup.product,
    pickup.quantity != null && pickup.unit ? `${pickup.quantity}${pickup.unit}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const locationPart = pickup.locationText ? ` at ${pickup.locationText}` : "";
  const body = `New pickup${locationPart}${jobDescription ? `: ${jobDescription}` : ""}. Reply LOC <lat> <lon> if you can take it.`;

  let sentTo = 0;
  for (const vehicle of vehicles) {
    if (!vehicle.primaryDriver) continue;
    const result = await sendSms(vehicle.primaryDriver.phoneNumber, orgPhone.twilioPhoneNumber, body);
    if (result.sent) sentTo++;
  }
  return { sentTo };
}
