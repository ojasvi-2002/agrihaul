import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Farmer } from "../../types/api";
import * as api from "./farmersApi";
import { ApiError } from "../../lib/apiClient";

export function FarmersPage() {
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Farmer | "new" | null>(null);

  async function refresh() {
    try {
      setFarmers(await api.listFarmers());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load farmers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = farmers.filter((f) =>
    `${f.name} ${f.phoneNumber}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="registry-page">
      <div className="registry-header">
        <h1>Farmers</h1>
        <button onClick={() => setEditing("new")}>+ Add farmer</button>
      </div>

      {editing && (
        <FarmerForm
          farmer={editing === "new" ? null : editing}
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <tr key={f.id}>
                <td>{f.name}</td>
                <td className="mono">{f.phoneNumber}</td>
                <td>
                  <button className="btn-ghost btn-sm" onClick={() => setEditing(f)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="empty-state">
                  No farmers found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FarmerForm({
  farmer,
  onCancel,
  onSaved,
}: {
  farmer: Farmer | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(farmer?.name ?? "");
  const [phoneNumber, setPhoneNumber] = useState(farmer?.phoneNumber ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (farmer) {
        await api.updateFarmer(farmer.id, { name, phoneNumber });
      } else {
        await api.createFarmer({ name, phoneNumber });
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
          {farmer ? "Save" : "Add farmer"}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
