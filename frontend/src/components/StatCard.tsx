import { Link } from "react-router-dom";

type StatCardProps = {
  value: number | string;
  label: string;
  // Use viewAllTo for a real route; onViewAll for something local (e.g.
  // switching tabs on the same page) that isn't its own URL. At most one
  // is meaningful at a time — if neither is given, the card just shows
  // the number and label with no link.
  viewAllTo?: string;
  onViewAll?: () => void;
};

export function StatCard({ value, label, viewAllTo, onViewAll }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
      {viewAllTo && (
        <Link to={viewAllTo} className="stat-card-link">
          view all →
        </Link>
      )}
      {!viewAllTo && onViewAll && (
        <button type="button" className="stat-card-link" onClick={onViewAll}>
          view all →
        </button>
      )}
    </div>
  );
}
