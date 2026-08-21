import { apiFetch } from "../../lib/apiClient";
import type { OrganizationWithCounts } from "../../types/api";

export function listOrganizations() {
  return apiFetch<{ organizations: OrganizationWithCounts[] }>("/api/platform-admin/organizations").then(
    (r) => r.organizations,
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
