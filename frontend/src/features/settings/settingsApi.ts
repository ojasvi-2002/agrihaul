import { apiFetch } from "../../lib/apiClient";
import type { Organization, OrganizationPhoneNumber, User, UserRole } from "../../types/api";

export function updateOrganization(name: string) {
  return apiFetch<{ organization: Organization }>("/api/organizations/current", {
    method: "PATCH",
    body: JSON.stringify({ name }),
  }).then((r) => r.organization);
}

export function listPhoneNumbers() {
  return apiFetch<{ phoneNumbers: OrganizationPhoneNumber[] }>("/api/organizations/current/phone-numbers").then(
    (r) => r.phoneNumbers,
  );
}

export function addPhoneNumber(data: { twilioPhoneNumber: string; friendlyName?: string }) {
  return apiFetch<{ phoneNumber: OrganizationPhoneNumber }>("/api/organizations/current/phone-numbers", {
    method: "POST",
    body: JSON.stringify(data),
  }).then((r) => r.phoneNumber);
}

export function setPhoneNumberActive(id: string, active: boolean) {
  return apiFetch<{ phoneNumber: OrganizationPhoneNumber }>(`/api/organizations/current/phone-numbers/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  }).then((r) => r.phoneNumber);
}

export function listTeam() {
  return apiFetch<{ users: User[] }>("/api/team").then((r) => r.users);
}

export function inviteTeamMember(data: { name: string; email: string; role: UserRole; password: string }) {
  return apiFetch<{ user: User }>("/api/team", {
    method: "POST",
    body: JSON.stringify(data),
  }).then((r) => r.user);
}
