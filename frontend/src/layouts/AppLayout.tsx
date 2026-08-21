import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";

export function AppLayout() {
  const { user, organization, loading, logout } = useAuth();

  if (loading) return <div className="app-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-logo">AgriHaul</div>
        <div className="app-org">{organization?.name}</div>
        <nav className="app-nav">
          <NavLink to="/conversations" className={({ isActive }) => (isActive ? "active" : "")}>
            Conversations
          </NavLink>
          <NavLink to="/pickups" className={({ isActive }) => (isActive ? "active" : "")}>
            Pickups
          </NavLink>
          <NavLink to="/farmers" className={({ isActive }) => (isActive ? "active" : "")}>
            Farmers
          </NavLink>
          <NavLink to="/farms" className={({ isActive }) => (isActive ? "active" : "")}>
            Farms
          </NavLink>
          <NavLink to="/drivers" className={({ isActive }) => (isActive ? "active" : "")}>
            Drivers
          </NavLink>
          <NavLink to="/vehicles" className={({ isActive }) => (isActive ? "active" : "")}>
            Vehicles
          </NavLink>
          <NavLink to="/map" className={({ isActive }) => (isActive ? "active" : "")}>
            Map
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>
            Settings
          </NavLink>
        </nav>
        <div className="app-topbar-right">
          <span className="app-user">{user.name}</span>
          <button className="btn-ghost" onClick={() => logout()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
