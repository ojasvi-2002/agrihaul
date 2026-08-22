import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";
import type { ImpersonationLogEntry, OrganizationPhoneNumber, TeamInvite, User, UserRole } from "../../types/api";
import * as api from "./settingsApi";
import { ApiError } from "../../lib/apiClient";

export function SettingsPage() {
  const { user, organization } = useAuth();
  const canManage = user?.role === "OWNER" || user?.role === "ADMIN";

  return (
    <div className="registry-page">
      <div className="registry-header">
        <h1>Settings</h1>
      </div>

      <OrganizationSection currentName={organization?.name ?? ""} canManage={canManage} />
      <PhoneNumbersSection canManage={canManage} />
      <TeamSection canManage={canManage} />
      {canManage && <ImpersonationLogSection />}
    </div>
  );
}

function OrganizationSection({ currentName, canManage }: { currentName: string; canManage: boolean }) {
  const [name, setName] = useState(currentName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => setName(currentName), [currentName]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      await api.updateOrganization(name);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="settings-section">
      <h2>Organization</h2>
      <form className="form-row" onSubmit={handleSubmit}>
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} required />
        {canManage && (
          <button type="submit" disabled={submitting}>
            Save
          </button>
        )}
      </form>
      {saved && <p className="settings-note">Saved.</p>}
      {error && <p className="page-error">{error}</p>}
      {!canManage && <p className="settings-note">Only an owner or admin can change this.</p>}
    </section>
  );
}

function PhoneNumbersSection({ canManage }: { canManage: boolean }) {
  const [phoneNumbers, setPhoneNumbers] = useState<OrganizationPhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [twilioPhoneNumber, setTwilioPhoneNumber] = useState("");
  const [friendlyName, setFriendlyName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    try {
      setPhoneNumbers(await api.listPhoneNumbers());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load phone numbers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.addPhoneNumber({ twilioPhoneNumber, friendlyName: friendlyName || undefined });
      setTwilioPhoneNumber("");
      setFriendlyName("");
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add phone number");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(phone: OrganizationPhoneNumber) {
    try {
      await api.setPhoneNumberActive(phone.id, !phone.active);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update phone number");
    }
  }

  return (
    <section className="settings-section">
      <div className="registry-header">
        <h2>Phone numbers</h2>
        {canManage && (
          <button className="btn-sm" onClick={() => setShowForm((v) => !v)}>
            + Add
          </button>
        )}
      </div>

      {showForm && (
        <form className="registry-form" onSubmit={handleAdd}>
          <div className="form-row">
            <label>
              Twilio number (E.164)
              <input
                value={twilioPhoneNumber}
                onChange={(e) => setTwilioPhoneNumber(e.target.value)}
                placeholder="+15551234567"
                required
              />
            </label>
            <label>
              Label
              <input value={friendlyName} onChange={(e) => setFriendlyName(e.target.value)} placeholder="Main line" />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={submitting}>
              Add number
            </button>
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p className="page-error">{error}</p>}
      {loading && <div className="empty-state">Loading…</div>}
      {!loading && phoneNumbers.length === 0 && <p className="settings-note">No phone numbers configured yet.</p>}
      {!loading && phoneNumbers.length > 0 && (
        <table className="registry-table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Label</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {phoneNumbers.map((p) => (
              <tr key={p.id}>
                <td className="mono">{p.twilioPhoneNumber}</td>
                <td>{p.friendlyName ?? "—"}</td>
                <td>
                  <span className={`status-badge status-${p.active ? "active" : "inactive"}`}>
                    {p.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td>
                  {canManage && (
                    <button className="btn-ghost btn-sm" onClick={() => toggleActive(p)}>
                      {p.active ? "Deactivate" : "Activate"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const ROLES: UserRole[] = ["OWNER", "ADMIN", "DISPATCHER"];

function TeamSection({ canManage }: { canManage: boolean }) {
  const { viewAs } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("DISPATCHER");
  const [submitting, setSubmitting] = useState(false);
  const [justInvited, setJustInvited] = useState<string | null>(null);
  const [viewAsBusyId, setViewAsBusyId] = useState<string | null>(null);

  async function refresh() {
    try {
      const [u, i] = await Promise.all([api.listTeam(), canManage ? api.listPendingInvites() : Promise.resolve([])]);
      setUsers(u);
      setInvites(i);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setJustInvited(null);
    try {
      const invite = await api.inviteTeamMember({ name, email, role });
      setJustInvited(invite.email);
      setName("");
      setEmail("");
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send invite");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(inviteId: string) {
    try {
      await api.revokeInvite(inviteId);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to revoke invite");
    }
  }

  async function handleViewAs(userId: string) {
    setViewAsBusyId(userId);
    setError(null);
    try {
      await viewAs(userId);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start viewing as this user");
    } finally {
      setViewAsBusyId(null);
    }
  }

  return (
    <section className="settings-section">
      <div className="registry-header">
        <h2>Team</h2>
        {canManage && (
          <button className="btn-sm" onClick={() => setShowForm((v) => !v)}>
            + Invite teammate
          </button>
        )}
      </div>

      {showForm && (
        <form className="registry-form" onSubmit={handleInvite}>
          <div className="form-row">
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
          </div>
          <div className="form-row">
            <label>
              Role
              <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="settings-note">
            They'll get an email with a link to set their own password and join — nothing to share yourself.
          </p>
          <div className="form-actions">
            <button type="submit" disabled={submitting}>
              Send invite
            </button>
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {justInvited && <p className="settings-note">Invite sent to {justInvited}.</p>}
      {error && <p className="page-error">{error}</p>}
      {loading && <div className="empty-state">Loading…</div>}
      {!loading && (
        <table className="registry-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="mono">{u.email}</td>
                <td>{u.role}</td>
                {canManage && (
                  <td>
                    {u.role === "DISPATCHER" && (
                      <button
                        className="btn-ghost btn-sm"
                        disabled={viewAsBusyId === u.id}
                        onClick={() => handleViewAs(u.id)}
                      >
                        View as
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && canManage && invites.length > 0 && (
        <>
          <h3 className="settings-subheading">Pending invites</h3>
          <table className="registry-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => {
                const expired = new Date(inv.expiresAt).getTime() < Date.now();
                return (
                  <tr key={inv.id}>
                    <td>{inv.name}</td>
                    <td className="mono">{inv.email}</td>
                    <td>{inv.role}</td>
                    <td>
                      <span className={`status-badge status-${expired ? "inactive" : "active"}`}>
                        {expired ? "Expired" : "Pending"}
                      </span>
                    </td>
                    <td>
                      <button className="btn-ghost btn-sm" onClick={() => handleRevoke(inv.id)}>
                        Revoke
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

// Read-only audit trail for every "View as" session — who viewed as whom,
// when it started, and whether it's still ongoing. Confirmed via
// AskUserQuestion earlier: every impersonation event must be logged, and
// this is where that log becomes visible rather than only living in the
// database.
function ImpersonationLogSection() {
  const [logs, setLogs] = useState<ImpersonationLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listImpersonationLogs()
      .then(setLogs)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load impersonation log"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="settings-section">
      <div className="registry-header">
        <h2>Impersonation log</h2>
      </div>
      <p className="settings-note">Every time an owner or admin views the app as an employee, it's recorded here.</p>

      {error && <p className="page-error">{error}</p>}
      {loading && <div className="empty-state">Loading…</div>}
      {!loading && logs.length === 0 && <p className="settings-note">No impersonation activity yet.</p>}
      {!loading && logs.length > 0 && (
        <table className="registry-table">
          <thead>
            <tr>
              <th>Admin</th>
              <th>Viewed as</th>
              <th>Started</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.admin.name} <span className="mono">{l.admin.email}</span>
                </td>
                <td>
                  {l.target.name} <span className="mono">{l.target.email}</span>
                </td>
                <td>{new Date(l.startedAt).toLocaleString()}</td>
                <td>
                  {l.endedAt ? (
                    <span className="status-badge status-inactive">Ended {new Date(l.endedAt).toLocaleString()}</span>
                  ) : (
                    <span className="status-badge status-active">Ongoing</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
