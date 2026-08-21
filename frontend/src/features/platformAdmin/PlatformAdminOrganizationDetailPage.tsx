import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { usePlatformAdminAuth } from "./PlatformAdminAuthContext";
import type { OrganizationDetail } from "../../types/api";
import * as api from "./platformAdminApi";
import { ApiError } from "../../lib/apiClient";

export function PlatformAdminOrganizationDetailPage() {
  const { admin, loading: authLoading, logout } = usePlatformAdminAuth();
  const { id } = useParams<{ id: string }>();
  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!id) return;
    try {
      setOrg(await api.getOrganization(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load organization");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (admin) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, id]);

  if (!authLoading && !admin) return <Navigate to="/platform-admin/login" replace />;

  async function toggleStatus() {
    if (!org) return;
    setBusy(true);
    setError(null);
    try {
      if (org.status === "ACTIVE") await api.suspendOrganization(org.id);
      else await api.activateOrganization(org.id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="platform-admin-page">
      <header className="platform-admin-topbar">
        <div className="app-logo">AgriHaul Platform Admin</div>
        <div className="app-topbar-right">
          <span className="app-user">{admin?.name}</span>
          <button className="btn-ghost" onClick={() => logout()}>
            Sign out
          </button>
        </div>
      </header>

      <div className="registry-page">
        <Link to="/platform-admin" className="detail-back-link">
          ← All organizations
        </Link>

        {error && <p className="page-error">{error}</p>}
        {loading && <div className="empty-state">Loading…</div>}

        {!loading && org && (
          <>
            <div className="detail-header">
              <h1>{org.name}</h1>
              <div>
                <span className={`status-badge status-${org.status.toLowerCase()}`}>{org.status}</span>{" "}
                <button className="btn-ghost btn-sm" disabled={busy} onClick={toggleStatus}>
                  {org.status === "ACTIVE" ? "Suspend" : "Activate"}
                </button>
              </div>
            </div>
            <p className="detail-meta">
              <span className="mono">{org.slug}</span> · created {new Date(org.createdAt).toLocaleDateString()} ·{" "}
              {org.lastActivityAt
                ? `last activity ${new Date(org.lastActivityAt).toLocaleString()}`
                : "no activity yet"}
            </p>

            <div className="stat-strip">
              <div className="stat-card">
                <div className="stat-card-value">{org._count.users}</div>
                <div className="stat-card-label">Users</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-value">{org._count.farmers}</div>
                <div className="stat-card-label">Farmers</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-value">{org._count.farms}</div>
                <div className="stat-card-label">Farms</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-value">{org._count.drivers}</div>
                <div className="stat-card-label">Drivers</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-value">{org._count.vehicles}</div>
                <div className="stat-card-label">Vehicles</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-value">{org._count.conversations}</div>
                <div className="stat-card-label">Conversations</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-value">{org._count.messages}</div>
                <div className="stat-card-label">Messages</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-value">{org._count.pickupRequests}</div>
                <div className="stat-card-label">Pickups</div>
              </div>
            </div>

            <h2>Team</h2>
            <table className="registry-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {org.users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td className="mono">{u.email}</td>
                    <td>{u.role}</td>
                    <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {org.users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty-state">
                      No team members yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <h2>Phone numbers</h2>
            <table className="registry-table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Label</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {org.phoneNumbers.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.twilioPhoneNumber}</td>
                    <td>{p.friendlyName ?? "—"}</td>
                    <td>
                      <span className={`status-badge status-${p.active ? "active" : "inactive"}`}>
                        {p.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
                {org.phoneNumbers.length === 0 && (
                  <tr>
                    <td colSpan={3} className="empty-state">
                      No phone numbers configured
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
