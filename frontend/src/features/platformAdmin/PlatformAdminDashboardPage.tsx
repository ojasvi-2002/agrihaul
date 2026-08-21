import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { usePlatformAdminAuth } from "./PlatformAdminAuthContext";
import type { OrganizationWithCounts } from "../../types/api";
import * as api from "./platformAdminApi";
import { ApiError } from "../../lib/apiClient";

export function PlatformAdminDashboardPage() {
  const { admin, loading: authLoading, logout } = usePlatformAdminAuth();
  const [organizations, setOrganizations] = useState<OrganizationWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    try {
      setOrganizations(await api.listOrganizations());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (admin) refresh();
  }, [admin]);

  if (!authLoading && !admin) return <Navigate to="/platform-admin/login" replace />;

  async function toggleStatus(org: OrganizationWithCounts) {
    setBusyId(org.id);
    setError(null);
    try {
      if (org.status === "ACTIVE") await api.suspendOrganization(org.id);
      else await api.activateOrganization(org.id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusyId(null);
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
        <div className="registry-header">
          <h1>Organizations</h1>
          <button onClick={() => setShowForm((v) => !v)}>+ Create organization</button>
        </div>

        {showForm && <CreateOrganizationForm onCancel={() => setShowForm(false)} onCreated={async () => { setShowForm(false); await refresh(); }} />}

        {error && <p className="page-error">{error}</p>}
        {loading && <div className="empty-state">Loading…</div>}

        {!loading && (
          <table className="registry-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Slug</th>
                <th>Users</th>
                <th>Farmers</th>
                <th>Pickups</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => (
                <tr key={org.id}>
                  <td>{org.name}</td>
                  <td className="mono">{org.slug}</td>
                  <td>{org._count.users}</td>
                  <td>{org._count.farmers}</td>
                  <td>{org._count.pickupRequests}</td>
                  <td>
                    <span className={`status-badge status-${org.status.toLowerCase()}`}>{org.status}</span>
                  </td>
                  <td>
                    <button className="btn-ghost btn-sm" disabled={busyId === org.id} onClick={() => toggleStatus(org)}>
                      {org.status === "ACTIVE" ? "Suspend" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
              {organizations.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-state">
                    No organizations yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CreateOrganizationForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [organizationName, setOrganizationName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createOrganization({ organizationName, ownerName, email, password });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create organization");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="registry-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          Organization name
          <input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required />
        </label>
        <label>
          Owner name
          <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required />
        </label>
      </div>
      <div className="form-row">
        <label>
          Owner email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Initial password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        </label>
      </div>
      {error && <p className="page-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          Create
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
