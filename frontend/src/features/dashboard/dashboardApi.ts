import { apiFetch } from "../../lib/apiClient";
import type { DashboardStats } from "../../types/api";

export function getStats() {
  return apiFetch<{ stats: DashboardStats }>("/api/dashboard/stats").then((r) => r.stats);
}
