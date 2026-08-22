import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { usePlatformAdminAuth } from "./PlatformAdminAuthContext";
import type { OrganizationDetail, PickupRequest, PlatformDriver, PlatformFarmer } from "../../types/api";
import * as api from "./platformAdminApi";
import { ApiError } from "../../lib/apiClient";

type TabKey = "overview" | "employees" | "drivers" | "farmers" | "dispatch" | "phones";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "employees", label: "Employees" },
  { key: "drivers", label: "Drivers" },
  { key: "farmers", label: "Farmers" },
  { key: "dispatch", label: "Dispatch Log" },
  { key: "phones", label: "Phone Numbers" },
];

export function PlatformAdminOrganizationDetailPage() {
  const { admin, loading: authLoading, logout } = usePlatformAdminAuth();
  const { id } = useParams<{ id: string }>();
  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  // Each tab's data loads on first visit and is cached here — switching
  // back to an already-loaded tab doesn't refetch.
  const [drivers, setDrivers] = useState<PlatformDriver[] | null>(null);
  const [farmers, setFarmers] = useState<PlatformFarmer[] | null>(null);
  const [pickups, setPickups] = useState<PickupRequest[] | null>(null);
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);

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

  // Resets the per-tab cache when navigating to a different organization
  // (id changes) so a stale org's data can't flash under a new one.
  useEffect(() => {
    setDrivers(null);
    setFarmers(null);
    setPickups(null);
    setActiveTab("overview");
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setTabError(null);
    if (activeTab === "drivers" && drivers === null) {
      setTabLoading(true);
      api
        .getOrganizationDrivers(id)
        .then(setDrivers)
        .catch((err) => setTabError(err instanceof ApiError ? err.message : "Failed to load drivers"))
        .finally(() => setTabLoading(false));
    } else if (activeTab === "farmers" && farmers === null) {
      setTabLoading(true);
      api
        .getOrganizationFarmers(id)
        .then(setFarmers)
        .catch((err) => setTabError(err instanceof ApiError ? err.message : "Failed to load farmers"))
        .finally(() => setTabLoading(false));
    } else if (activeTab === "dispatch" && pickups === null) {
      setTabLoading(true);
      api
        .getOrganizationDispatchLog(id)
        .then(setPickups)
        .catch((err) => setTabError(err instanceof ApiError ? err.message : "Failed to load dispatch log"))
        .finally(() => setTabLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, id]);

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

            <div className="vertical-tabs">
              <nav className="vertical-tab-list">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    className={`vertical-tab ${activeTab === t.key ? "active" : ""}`}
                    onClick={() => setActiveTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>

              <div className="vertical-tab-panel">
                {tabError && <p className="page-error">{tabError}</p>}

                {activeTab === "overview" && (
                  <div className="stat-strip">
                    <div className="stat-card">
                      <div className="stat-card-value">{org._count.users}</div>
                      <div className="stat-card-label">Employees</div>
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
                )}

                {activeTab === "employees" && (
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
                            No employees yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}

                {activeTab === "drivers" && (
                  <>
                    {tabLoading && !drivers && <div className="empty-state">Loading…</div>}
                    {drivers && (
                      <table className="registry-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Phone</th>
                            <th>Status</th>
                            <th>Assigned vehicle</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drivers.map((d) => (
                            <tr key={d.id}>
                              <td>{d.name}</td>
                              <td className="mono">{d.phoneNumber}</td>
                              <td>
                                <span className={`status-badge status-${d.status.toLowerCase()}`}>{d.status}</span>
                              </td>
                              <td>
                                {d.primaryVehicle
                                  ? `${d.primaryVehicle.name} (${d.primaryVehicle.registrationNumber})`
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                          {drivers.length === 0 && (
                            <tr>
                              <td colSpan={4} className="empty-state">
                                No drivers yet
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </>
                )}

                {activeTab === "farmers" && (
                  <>
                    {tabLoading && !farmers && <div className="empty-state">Loading…</div>}
                    {farmers && (
                      <table className="registry-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Phone</th>
                            <th>Farms on file</th>
                          </tr>
                        </thead>
                        <tbody>
                          {farmers.map((f) => (
                            <tr key={f.id}>
                              <td>{f.name}</td>
                              <td className="mono">{f.phoneNumber}</td>
                              <td>{f._count.farms}</td>
                            </tr>
                          ))}
                          {farmers.length === 0 && (
                            <tr>
                              <td colSpan={3} className="empty-state">
                                No farmers yet
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </>
                )}

                {activeTab === "dispatch" && (
                  <>
                    {tabLoading && !pickups && <div className="empty-state">Loading…</div>}
                    {pickups && (
                      <table className="registry-table">
                        <thead>
                          <tr>
                            <th>Farmer</th>
                            <th>Product</th>
                            <th>Qty</th>
                            <th>Status</th>
                            <th>Driver</th>
                            <th>Assigned</th>
                            <th>Completed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pickups.map((p) => {
                            const latest = p.assignments[0];
                            return (
                              <tr key={p.id}>
                                <td>{p.farmer.name}</td>
                                <td>{p.product ?? "—"}</td>
                                <td>{p.quantity != null ? `${p.quantity} ${p.unit ?? ""}` : "—"}</td>
                                <td>
                                  <span className={`status-badge status-${p.status.toLowerCase()}`}>{p.status}</span>
                                </td>
                                <td>{latest ? latest.driver.name : "—"}</td>
                                <td>{latest ? new Date(latest.assignedAt).toLocaleString() : "—"}</td>
                                <td>{latest?.completedAt ? new Date(latest.completedAt).toLocaleString() : "—"}</td>
                              </tr>
                            );
                          })}
                          {pickups.length === 0 && (
                            <tr>
                              <td colSpan={7} className="empty-state">
                                No dispatch activity yet
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </>
                )}

                {activeTab === "phones" && (
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
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
