import { apiFetch } from "../../lib/apiClient";
import type { ImpersonationLogEntry, Organization, OrganizationPhoneNumber, TeamInvite, User, UserRole } from "../../types/api";

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

export function inviteTeamMember(data: { name: string; email: string; role: UserRole }) {
  return apiFetch<{ invite: TeamInvite }>("/api/team", {
    method: "POST",
    body: JSON.stringify(data),
  }).then((r) => r.invite);
}

export function listPendingInvites() {
  return apiFetch<{ invites: TeamInvite[] }>("/api/team/invites").then((r) => r.invites);
}

export function revokeInvite(id: string) {
  return apiFetch<void>(`/api/team/invites/${id}`, { method: "DELETE" });
}

export function listImpersonationLogs() {
  return apiFetch<{ logs: ImpersonationLogEntry[] }>("/api/team/impersonation-logs").then((r) => r.logs);
}
