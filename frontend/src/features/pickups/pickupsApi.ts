import { apiFetch } from "../../lib/apiClient";
import type { PickupRequest, RecommendationResult, Driver, Vehicle, Farmer, PickupStatus } from "../../types/api";

export function listPickups() {
  return apiFetch<{ pickups: PickupRequest[] }>("/api/pickups").then((r) => r.pickups);
}

export function createPickup(data: {
  farmerId: string;
  product?: string;
  quantity?: number;
  unit?: string;
  notes?: string;
}) {
  return apiFetch<{ pickup: PickupRequest }>("/api/pickups", {
    method: "POST",
    body: JSON.stringify(data),
  }).then((r) => r.pickup);
}

export function updatePickup(
  id: string,
  data: Partial<{
    status: PickupStatus;
    product: string;
    quantity: number;
    unit: string;
    notes: string;
  }>,
) {
  return apiFetch<{ pickup: PickupRequest }>(`/api/pickups/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }).then((r) => r.pickup);
}

export function getRecommendation(id: string) {
  return apiFetch<RecommendationResult>(`/api/pickups/${id}/recommendation`);
}

export function broadcastToDrivers(id: string) {
  return apiFetch<{ sentTo: number }>(`/api/pickups/${id}/broadcast`, { method: "POST" });
}

export function assignPickup(id: string, driverId: string, vehicleId: string) {
  return apiFetch(`/api/pickups/${id}/assign`, {
    method: "POST",
    body: JSON.stringify({ driverId, vehicleId }),
  });
}

export function listDrivers() {
  return apiFetch<{ drivers: Driver[] }>("/api/drivers").then((r) => r.drivers);
}

export function listVehicles() {
  return apiFetch<{ vehicles: Vehicle[] }>("/api/vehicles").then((r) => r.vehicles);
}

export function listFarmers() {
  return apiFetch<{ farmers: Farmer[] }>("/api/farmers").then((r) => r.farmers);
}
