import { useEffect, useState } from "react";
import type { DashboardStats } from "../../types/api";
import * as api from "./dashboardApi";
import { ApiError } from "../../lib/apiClient";
import { StatCard } from "../../components/StatCard";

const CARDS: { key: keyof DashboardStats; label: string; viewAllTo: string }[] = [
  { key: "pendingPickups", label: "Pending Pickups", viewAllTo: "/pickups" },
  { key: "unassignedPickups", label: "Unassigned Pickups", viewAllTo: "/pickups" },
  { key: "pickupsToday", label: "Pickups Today", viewAllTo: "/pickups" },
  { key: "completedToday", label: "Completed Today", viewAllTo: "/pickups" },
  { key: "activeDrivers", label: "Active Drivers", viewAllTo: "/drivers" },
  { key: "pendingDispatches", label: "Pending Dispatches", viewAllTo: "/pickups" },
];

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getStats()
      .then(setStats)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="registry-page">
      <div className="registry-header">
        <h1>Dashboard</h1>
      </div>

      {error && <p className="page-error">{error}</p>}
      {loading && <div className="empty-state">Loading…</div>}

      {!loading && stats && (
        <div className="stat-strip">
          {CARDS.map((card) => (
            <StatCard key={card.key} value={stats[card.key]} label={card.label} viewAllTo={card.viewAllTo} />
          ))}
        </div>
      )}
    </div>
  );
}
