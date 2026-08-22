import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { DashboardStats } from "../../types/api";
import * as api from "./dashboardApi";
import { ApiError } from "../../lib/apiClient";

const CARDS: { key: keyof DashboardStats; label: string; viewAllTo: string }[] = [
  { key: "pendingPickups", label: "Pending Pickups", viewAllTo: "/pickups" },
  { key: "unassignedPickups", label: "Unassigned Pickups", viewAllTo: "/pickups" },
  { key: "pickupsToday", label: "Pickups Today", viewAllTo: "/pickups" },
  { key: "completedToday", label: "Completed Today", viewAllTo: "/pickups" },
  { key: "activeDrivers", label: "Active Drivers", viewAllTo: "/drivers" },
  { key: "messagesNeedingReview", label: "Needs Review", viewAllTo: "/conversations" },
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
        <div className="dashboard-grid">
          {CARDS.map((card) => (
            <div className="dashboard-card" key={card.key}>
              <div className="dashboard-card-value">{stats[card.key]}</div>
              <div className="dashboard-card-label">{card.label}</div>
              <Link to={card.viewAllTo} className="dashboard-card-link">
                view all →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
