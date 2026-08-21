import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Driver } from "../../types/api";
import * as api from "./driversApi";
import { ApiError } from "../../lib/apiClient";

export function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Driver | "new" | null>(null);

  async function refresh() {
    try {
      setDrivers(await api.listDrivers());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load drivers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function toggleStatus(driver: Driver) {
    try {
      await api.updateDriver(driver.id, { status: driver.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
    }
  }

  const filtered = drivers.filter((d) =>
    `${d.name} ${d.phoneNumber}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="registry-page">
      <div className="registry-header">
        <h1>Drivers</h1>
        <button onClick={() => setEditing("new")}>+ Add driver</button>
      </div>

      {editing && (
        <DriverForm
          driver={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}

      <input
        className="registry-search"
        placeholder="Search name or phone…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && <p className="page-error">{error}</p>}
      {loading && <div className="empty-state">Loading…</div>}

      {!loading && (
        <table className="registry-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td className="mono">{d.phoneNumber}</td>
                <td>
                  <span className={`status-badge status-${d.status.toLowerCase()}`}>{d.status}</span>
                </td>
                <td>
                  <button className="btn-ghost btn-sm" onClick={() => toggleStatus(d)}>
                    Toggle
                  </button>
                  <button className="btn-ghost btn-sm" onClick={() => setEditing(d)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-state">
                  No drivers found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DriverForm({
  driver,
  onCancel,
  onSaved,
}: {
  driver: Driver | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(driver?.name ?? "");
  const [phoneNumber, setPhoneNumber] = useState(driver?.phoneNumber ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (driver) {
        await api.updateDriver(driver.id, { name, phoneNumber });
      } else {
        await api.createDriver({ name, phoneNumber });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="registry-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Phone
          <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required />
        </label>
      </div>
      {error && <p className="page-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {driver ? "Save" : "Add driver"}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
