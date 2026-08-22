import { apiFetch } from "../../lib/apiClient";
import type {
  OrganizationDetail,
  OrganizationWithCounts,
  PickupRequest,
  PlatformDriver,
  PlatformFarmer,
  PlatformStats,
} from "../../types/api";

export function listOrganizations() {
  return apiFetch<{ organizations: OrganizationWithCounts[] }>("/api/platform-admin/organizations").then(
    (r) => r.organizations,
  );
}

export function getStats() {
  return apiFetch<{ stats: PlatformStats }>("/api/platform-admin/organizations/stats").then((r) => r.stats);
}

export function getOrganization(id: string) {
  return apiFetch<{ organization: OrganizationDetail }>(`/api/platform-admin/organizations/${id}`).then(
    (r) => r.organization,
  );
}

export function getOrganizationDrivers(id: string) {
  return apiFetch<{ drivers: PlatformDriver[] }>(`/api/platform-admin/organizations/${id}/drivers`).then(
    (r) => r.drivers,
  );
}

export function getOrganizationFarmers(id: string) {
  return apiFetch<{ farmers: PlatformFarmer[] }>(`/api/platform-admin/organizations/${id}/farmers`).then(
    (r) => r.farmers,
  );
}

export function getOrganizationDispatchLog(id: string) {
  return apiFetch<{ pickups: PickupRequest[] }>(`/api/platform-admin/organizations/${id}/pickups`).then(
    (r) => r.pickups,
  );
}

export function createOrganization(data: {
  organizationName: string;
  ownerName: string;
  email: string;
  password: string;
}) {
  return apiFetch<{ organization: OrganizationWithCounts }>("/api/platform-admin/organizations", {
    method: "POST",
    body: JSON.stringify(data),
  }).then((r) => r.organization);
}

export function suspendOrganization(id: string) {
  return apiFetch(`/api/platform-admin/organizations/${id}/suspend`, { method: "POST" });
}

export function activateOrganization(id: string) {
  return apiFetch(`/api/platform-admin/organizations/${id}/activate`, { method: "POST" });
}
