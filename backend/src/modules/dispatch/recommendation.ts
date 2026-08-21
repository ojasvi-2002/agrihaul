import { haversineKm } from "./distance";
import { listAvailableVehiclesWithLocation } from "../../repositories/vehicle.repository";

export type RecommendationCandidate = {
  vehicleId: string;
  vehicleName: string;
  registrationNumber: string;
  driverId: string;
  driverName: string;
  distanceKm: number;
  locationSource: "GPS" | "SMS_REPORTED";
  locationUpdatedAt: Date;
};

export type RecommendationResult =
  | { available: true; candidates: RecommendationCandidate[] }
  | { available: false; reason: string };

// Both dispatch-model tiers (GPS or SMS-reported) land in the same place:
// Vehicle.currentLatitude/Longitude. This never picks a truck on its
// own — it only ranks candidates for a dispatcher to confirm or override.
export async function recommendNearestVehicles(
  organizationId: string,
  pickupLocation: { latitude: number; longitude: number } | null,
  limit = 5,
): Promise<RecommendationResult> {
  if (!pickupLocation) {
    return { available: false, reason: "No farm location on file for this pickup request" };
  }

  const vehicles = await listAvailableVehiclesWithLocation(organizationId);
  if (vehicles.length === 0) {
    return { available: false, reason: "No available vehicles currently have a known location" };
  }

  const candidates = vehicles
    .map((v) => ({
      vehicleId: v.id,
      vehicleName: v.name,
      registrationNumber: v.registrationNumber,
      // Guaranteed non-null: listAvailableVehiclesWithLocation only
      // returns vehicles with an active primaryDriver.
      driverId: v.primaryDriver!.id,
      driverName: v.primaryDriver!.name,
      distanceKm: haversineKm(
        pickupLocation.latitude,
        pickupLocation.longitude,
        v.currentLatitude!,
        v.currentLongitude!,
      ),
      locationSource: v.locationSource!,
      locationUpdatedAt: v.locationUpdatedAt!,
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);

  return { available: true, candidates };
}
