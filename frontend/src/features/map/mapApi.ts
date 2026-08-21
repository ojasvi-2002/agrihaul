import { apiFetch } from "../../lib/apiClient";
import type { Vehicle, Farm, Farmer } from "../../types/api";

export function listVehicles() {
  return apiFetch<{ vehicles: Vehicle[] }>("/api/vehicles").then((r) => r.vehicles);
}

export function listFarms() {
  return apiFetch<{ farms: Farm[] }>("/api/farms").then((r) => r.farms);
}

export function listFarmers() {
  return apiFetch<{ farmers: Farmer[] }>("/api/farmers").then((r) => r.farmers);
}
