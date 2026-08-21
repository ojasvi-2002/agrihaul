import { apiFetch } from "../../lib/apiClient";
import type { Vehicle, Driver } from "../../types/api";

export function listVehicles() {
  return apiFetch<{ vehicles: Vehicle[] }>("/api/vehicles").then((r) => r.vehicles);
}

export function listDrivers() {
  return apiFetch<{ drivers: Driver[] }>("/api/drivers").then((r) => r.drivers);
}

export function createVehicle(data: {
  name: string;
  registrationNumber: string;
  capacity?: number;
  primaryDriverId?: string;
}) {
  return apiFetch<{ vehicle: Vehicle }>("/api/vehicles", {
    method: "POST",
    body: JSON.stringify(data),
  }).then((r) => r.vehicle);
}

export function updateVehicle(
  id: string,
  data: Partial<{
    name: string;
    registrationNumber: string;
    capacity: number;
    primaryDriverId: string | null;
    status: Vehicle["status"];
  }>,
) {
  return apiFetch<{ vehicle: Vehicle }>(`/api/vehicles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }).then((r) => r.vehicle);
}
