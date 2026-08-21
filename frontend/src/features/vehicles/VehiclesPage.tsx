import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Vehicle, Driver } from "../../types/api";
import * as api from "./vehiclesApi";
import { ApiError } from "../../lib/apiClient";

const STATUS_CYCLE: Vehicle["status"][] = ["AVAILABLE", "EN_ROUTE", "MAINTENANCE", "INACTIVE"];

export function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Vehicle | "new" | null>(null);

  async function refresh() {
    try {
      const [v, d] = await Promise.all([api.listVehicles(), api.listDrivers()]);
      setVehicles(v);
      setDrivers(d);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load vehicles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function cycleStatus(vehicle: Vehicle) {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(vehicle.status) + 1) % STATUS_CYCLE.length];
    try {
      await api.updateVehicle(vehicle.id, { status: next });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
    }
  }

  const filtered = vehicles.filter((v) =>
    `${v.name} ${v.registrationNumber} ${v.primaryDriver?.name ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <div className="registry-page">
      <div className="registry-header">
        <h1>Vehicles</h1>
        <button onClick={() => setEditing("new")}>+ Add vehicle</button>
      </div>

      {editing && (
        <VehicleForm
          vehicle={editing === "new" ? null : editing}
          drivers={drivers}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}

      <input
        className="registry-search"
        placeholder="Search truck, registration, or driver…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && <p className="page-error">{error}</p>}
      {loading && <div className="empty-state">Loading…</div>}

      {!loading && (
        <table className="registry-table">
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Registration</th>
              <th>Driver</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr key={v.id}>
                <td>{v.name}</td>
                <td className="mono">{v.registrationNumber}</td>
                <td>{v.primaryDriver?.name ?? "—"}</td>
                <td>
                  <span className={`status-badge status-${v.status.toLowerCase()}`}>{v.status}</span>
                </td>
                <td>
                  <button className="btn-ghost btn-sm" onClick={() => cycleStatus(v)}>
                    Toggle
                  </button>
                  <button className="btn-ghost btn-sm" onClick={() => setEditing(v)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-state">
                  No vehicles found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function VehicleForm({
  vehicle,
  drivers,
  onCancel,
  onSaved,
}: {
  vehicle: Vehicle | null;
  drivers: Driver[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(vehicle?.name ?? "");
  const [registrationNumber, setRegistrationNumber] = useState(vehicle?.registrationNumber ?? "");
  const [capacity, setCapacity] = useState(vehicle?.capacity?.toString() ?? "");
  const [primaryDriverId, setPrimaryDriverId] = useState(vehicle?.primaryDriverId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const capacityValue = capacity ? Number(capacity) : undefined;
      if (vehicle) {
        // Explicit `null` when cleared to "None" — omitting the key
        // entirely (via `undefined`) would make the backend treat it as
        // "no change" and silently keep the old driver.
        await api.updateVehicle(vehicle.id, {
          name,
          registrationNumber,
          capacity: capacityValue,
          primaryDriverId: primaryDriverId || null,
        });
      } else {
        await api.createVehicle({
          name,
          registrationNumber,
          capacity: capacityValue,
          primaryDriverId: primaryDriverId || undefined,
        });
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
          Vehicle name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Registration
          <input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} required />
        </label>
      </div>
      <div className="form-row">
        <label>
          Capacity (kg)
          <input type="number" min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </label>
        <label>
          Primary driver
          <select value={primaryDriverId} onChange={(e) => setPrimaryDriverId(e.target.value)}>
            <option value="">None</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="page-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {vehicle ? "Save" : "Add vehicle"}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
