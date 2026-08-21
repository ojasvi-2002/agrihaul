import { apiFetch } from "../../lib/apiClient";
import type { Farmer } from "../../types/api";

export function listFarmers() {
  return apiFetch<{ farmers: Farmer[] }>("/api/farmers").then((r) => r.farmers);
}

export function createFarmer(data: { name: string; phoneNumber: string }) {
  return apiFetch<{ farmer: Farmer }>("/api/farmers", {
    method: "POST",
    body: JSON.stringify(data),
  }).then((r) => r.farmer);
}

export function updateFarmer(id: string, data: Partial<{ name: string; phoneNumber: string }>) {
  return apiFetch<{ farmer: Farmer }>(`/api/farmers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }).then((r) => r.farmer);
}
