import { apiFetch } from "../../lib/apiClient";
import type { Driver } from "../../types/api";

export function listDrivers() {
  return apiFetch<{ drivers: Driver[] }>("/api/drivers").then((r) => r.drivers);
}

export function createDriver(data: { name: string; phoneNumber: string }) {
  return apiFetch<{ driver: Driver }>("/api/drivers", {
    method: "POST",
    body: JSON.stringify(data),
  }).then((r) => r.driver);
}

export function updateDriver(
  id: string,
  data: Partial<{ name: string; phoneNumber: string; status: "ACTIVE" | "INACTIVE" }>,
) {
  return apiFetch<{ driver: Driver }>(`/api/drivers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }).then((r) => r.driver);
}
