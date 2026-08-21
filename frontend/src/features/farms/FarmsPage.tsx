import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Farm, Farmer } from "../../types/api";
import * as api from "./farmsApi";
import { ApiError } from "../../lib/apiClient";

export function FarmsPage() {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Farm | "new" | null>(null);

  async function refresh() {
    try {
      const [f, fa] = await Promise.all([api.listFarms(), api.listFarmers()]);
      setFarms(f);
      setFarmers(fa);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load farms");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const farmerName = (id: string) => farmers.find((f) => f.id === id)?.name ?? "—";

  const filtered = farms.filter((f) =>
    `${f.name} ${f.address ?? ""} ${farmerName(f.farmerId)}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="registry-page">
      <div className="registry-header">
        <h1>Farms</h1>
        <button onClick={() => setEditing("new")} disabled={farmers.length === 0}>
          + Add farm
        </button>
      </div>

      {editing && (
        <FarmForm
          farm={editing === "new" ? null : editing}
          farmers={farmers}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}

      <input
        className="registry-search"
        placeholder="Search farm, farmer, or address…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && <p className="page-error">{error}</p>}
      {loading && <div className="empty-state">Loading…</div>}

      {!loading && (
        <table className="registry-table">
          <thead>
            <tr>
              <th>Farm</th>
              <th>Farmer</th>
              <th>Address</th>
              <th>Lat</th>
              <th>Lon</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <tr key={f.id}>
                <td>{f.name}</td>
                <td>{farmerName(f.farmerId)}</td>
                <td>{f.address ?? "—"}</td>
                <td className="mono">{f.latitude ?? "—"}</td>
                <td className="mono">{f.longitude ?? "—"}</td>
                <td>
                  <button className="btn-ghost btn-sm" onClick={() => setEditing(f)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-state">
                  No farms found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FarmForm({
  farm,
  farmers,
  onCancel,
  onSaved,
}: {
  farm: Farm | null;
  farmers: Farmer[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [farmerId, setFarmerId] = useState(farm?.farmerId ?? "");
  const [name, setName] = useState(farm?.name ?? "");
  const [address, setAddress] = useState(farm?.address ?? "");
  const [latitude, setLatitude] = useState(farm?.latitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(farm?.longitude?.toString() ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const data = {
        name,
        address: address || undefined,
        latitude: latitude ? Number(latitude) : undefined,
        longitude: longitude ? Number(longitude) : undefined,
      };
      if (farm) {
        await api.updateFarm(farm.id, data);
      } else {
        await api.createFarm({ farmerId, ...data });
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
        {!farm && (
          <label>
            Farmer
            <select value={farmerId} onChange={(e) => setFarmerId(e.target.value)} required>
              <option value="">Select a farmer…</option>
              {farmers.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Farm name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
      </div>
      <div className="form-row">
        <label>
          Address
          <input value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label>
          Latitude
          <input value={latitude} onChange={(e) => setLatitude(e.target.value)} />
        </label>
        <label>
          Longitude
          <input value={longitude} onChange={(e) => setLongitude(e.target.value)} />
        </label>
      </div>
      {error && <p className="page-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={submitting || (!farm && !farmerId)}>
          {farm ? "Save" : "Add farm"}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
