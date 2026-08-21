import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { PickupRequest, RecommendationResult, Driver, Vehicle, Farmer, PickupStatus } from "../../types/api";
import * as api from "./pickupsApi";
import { ApiError } from "../../lib/apiClient";

const STATUS_LABEL: Record<PickupStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function PickupsPage() {
  const [pickups, setPickups] = useState<PickupRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  async function refresh() {
    try {
      const [p, d, v, f] = await Promise.all([
        api.listPickups(),
        api.listDrivers(),
        api.listVehicles(),
        api.listFarmers(),
      ]);
      setPickups(p);
      setDrivers(d);
      setVehicles(v);
      setFarmers(f);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load pickups");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const selected = pickups.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="pickups-page">
      <aside className="pickup-list">
        <div className="pickup-list-header">
          <span>Pickups</span>
          <button className="btn-ghost btn-sm" onClick={() => setShowNewForm(true)}>
            + New
          </button>
        </div>
        {loading && <div className="empty-state">Loading…</div>}
        {!loading && pickups.length === 0 && <div className="empty-state">No pickup requests yet</div>}
        {pickups.map((p) => (
          <button
            key={p.id}
            className={`pickup-row ${p.id === selectedId ? "active" : ""}`}
            onClick={() => setSelectedId(p.id)}
          >
            <div className="pickup-row-top">
              <span className="pickup-row-farmer">{p.farmer.name}</span>
              <span className={`status-badge status-${p.status.toLowerCase()}`}>{STATUS_LABEL[p.status]}</span>
            </div>
            <div className="pickup-row-sub">
              {[p.product, p.quantity != null && p.unit ? `${p.quantity}${p.unit}` : null, p.locationText]
                .filter(Boolean)
                .join(" · ") || "—"}
            </div>
          </button>
        ))}
      </aside>

      <section className="pickup-detail">
        {error && <p className="page-error">{error}</p>}
        {!selected && !showNewForm && <div className="empty-state">Select a pickup request</div>}
        {showNewForm && (
          <NewPickupForm
            farmers={farmers}
            onCancel={() => setShowNewForm(false)}
            onCreated={async () => {
              setShowNewForm(false);
              await refresh();
            }}
          />
        )}
        {selected && !showNewForm && (
          <PickupDetail
            pickup={selected}
            drivers={drivers}
            vehicles={vehicles}
            onChanged={refresh}
          />
        )}
      </section>
    </div>
  );
}

function NewPickupForm({
  farmers,
  onCancel,
  onCreated,
}: {
  farmers: Farmer[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [farmerId, setFarmerId] = useState("");
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("KG");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!farmerId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createPickup({
        farmerId,
        product: product || undefined,
        quantity: quantity ? Number(quantity) : undefined,
        unit: quantity ? unit : undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create pickup");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="pickup-form" onSubmit={handleSubmit}>
      <h2>New pickup request</h2>
      <label>
        Farmer
        <select value={farmerId} onChange={(e) => setFarmerId(e.target.value)} required>
          <option value="">Select a farmer…</option>
          {farmers.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({f.phoneNumber})
            </option>
          ))}
        </select>
      </label>
      <label>
        Product
        <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="e.g. Maize" />
      </label>
      <div className="form-row">
        <label>
          Quantity
          <input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </label>
        <label>
          Unit
          <input value={unit} onChange={(e) => setUnit(e.target.value)} />
        </label>
      </div>
      {error && <p className="page-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={submitting || !farmerId}>
          Create
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function PickupDetail({
  pickup,
  drivers,
  vehicles,
  onChanged,
}: {
  pickup: PickupRequest;
  drivers: Driver[];
  vehicles: Vehicle[];
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [manualDriverId, setManualDriverId] = useState("");
  const [manualVehicleId, setManualVehicleId] = useState("");

  useEffect(() => {
    setRecommendation(null);
    setError(null);
  }, [pickup.id]);

  async function runAction(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const activeAssignment = pickup.assignments[0] ?? null;
  const canAssign = (pickup.status === "PENDING" || pickup.status === "CONFIRMED") && !activeAssignment;
  const availableVehicles = vehicles.filter((v) => v.status === "AVAILABLE");
  const activeDrivers = drivers.filter((d) => d.status === "ACTIVE");

  return (
    <div>
      <div className="pickup-detail-header">
        <div>
          <h2>{pickup.farmer.name}</h2>
          <div className="pickup-detail-sub">{pickup.farmer.phoneNumber}</div>
        </div>
        <span className={`status-badge status-${pickup.status.toLowerCase()}`}>{STATUS_LABEL[pickup.status]}</span>
      </div>

      <dl className="pickup-fields">
        <dt>Product</dt>
        <dd>{pickup.product ?? "—"}</dd>
        <dt>Quantity</dt>
        <dd>{pickup.quantity != null && pickup.unit ? `${pickup.quantity}${pickup.unit}` : "—"}</dd>
        <dt>Location</dt>
        <dd>{pickup.farm?.name ?? pickup.locationText ?? "—"}</dd>
        <dt>Requested date</dt>
        <dd>{pickup.requestedPickupDate ? new Date(pickup.requestedPickupDate).toLocaleDateString() : "—"}</dd>
      </dl>

      {activeAssignment && (
        <div className="assignment-card">
          <div className="assignment-card-title">Assigned</div>
          <div>{activeAssignment.driver.name} — {activeAssignment.vehicle.name} ({activeAssignment.vehicle.registrationNumber})</div>
        </div>
      )}

      {error && <p className="page-error">{error}</p>}

      <div className="pickup-actions">
        {pickup.status === "PENDING" && (
          <button disabled={busy} onClick={() => runAction(() => api.updatePickup(pickup.id, { status: "CONFIRMED" }))}>
            Confirm
          </button>
        )}
        {(pickup.status === "PENDING" || pickup.status === "CONFIRMED") && (
          <button className="btn-ghost" disabled={busy} onClick={() => runAction(() => api.updatePickup(pickup.id, { status: "CANCELLED" }))}>
            Cancel request
          </button>
        )}
        {(pickup.status === "ASSIGNED" || pickup.status === "IN_PROGRESS") && (
          <button disabled={busy} onClick={() => runAction(() => api.updatePickup(pickup.id, { status: "COMPLETED" }))}>
            Mark completed
          </button>
        )}
      </div>

      {canAssign && (
        <div className="dispatch-panel">
          <div className="dispatch-panel-title">Find a truck</div>
          <div className="pickup-actions">
            <button
              className="btn-ghost"
              disabled={busy}
              onClick={() => runAction(async () => setRecommendation(await api.getRecommendation(pickup.id)))}
            >
              Get recommendation
            </button>
            <button
              className="btn-ghost"
              disabled={busy}
              onClick={() =>
                runAction(async () => {
                  const result = await api.broadcastToDrivers(pickup.id);
                  setError(null);
                  alert(`Broadcast sent to ${result.sentTo} truck${result.sentTo === 1 ? "" : "s"}.`);
                })
              }
            >
              Broadcast to trucks
            </button>
          </div>

          {recommendation && recommendation.available && (
            <ul className="recommendation-list">
              {recommendation.candidates.map((c) => (
                <li key={c.vehicleId}>
                  <div>
                    <strong>{c.vehicleName}</strong> ({c.registrationNumber}) — {c.driverName}
                    <div className="recommendation-meta">
                      {c.distanceKm.toFixed(1)} km · {c.locationSource === "GPS" ? "GPS" : "SMS-reported"} ·{" "}
                      updated {new Date(c.locationUpdatedAt).toLocaleTimeString()}
                    </div>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => runAction(() => api.assignPickup(pickup.id, c.driverId, c.vehicleId))}
                  >
                    Assign
                  </button>
                </li>
              ))}
            </ul>
          )}
          {recommendation && !recommendation.available && (
            <p className="empty-state">{recommendation.reason}</p>
          )}

          <div className="manual-assign">
            <div className="dispatch-panel-title">Or choose manually</div>
            <div className="form-row">
              <select value={manualDriverId} onChange={(e) => setManualDriverId(e.target.value)}>
                <option value="">Driver…</option>
                {activeDrivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select value={manualVehicleId} onChange={(e) => setManualVehicleId(e.target.value)}>
                <option value="">Vehicle…</option>
                {availableVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.registrationNumber})
                  </option>
                ))}
              </select>
              <button
                disabled={busy || !manualDriverId || !manualVehicleId}
                onClick={() => runAction(() => api.assignPickup(pickup.id, manualDriverId, manualVehicleId))}
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
