import { apiFetch } from "../../lib/apiClient";
import type { Farm, Farmer } from "../../types/api";

export function listFarms() {
  return apiFetch<{ farms: Farm[] }>("/api/farms").then((r) => r.farms);
}

export function listFarmers() {
  return apiFetch<{ farmers: Farmer[] }>("/api/farmers").then((r) => r.farmers);
}

export function createFarm(data: {
  farmerId: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}) {
  return apiFetch<{ farm: Farm }>("/api/farms", {
    method: "POST",
    body: JSON.stringify(data),
  }).then((r) => r.farm);
}

export function updateFarm(
  id: string,
  data: Partial<{ name: string; address: string; latitude: number; longitude: number }>,
) {
  return apiFetch<{ farm: Farm }>(`/api/farms/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }).then((r) => r.farm);
}
