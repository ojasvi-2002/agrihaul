import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";

const NAV_GROUPS: { label: string; links: { to: string; label: string }[] }[] = [
  {
    label: "Monitor",
    links: [
      { to: "/conversations", label: "Conversations" },
      { to: "/pickups", label: "Pickups" },
      { to: "/map", label: "Map" },
    ],
  },
  {
    label: "Manage",
    links: [
      { to: "/farmers", label: "Farmers" },
      { to: "/farms", label: "Farms" },
      { to: "/drivers", label: "Drivers" },
      { to: "/vehicles", label: "Vehicles" },
    ],
  },
  {
    label: "Account",
    links: [{ to: "/settings", label: "Settings" }],
  },
];

export function AppLayout() {
  const { user, organization, loading, logout } = useAuth();

  if (loading) return <div className="app-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-logo">AgriHaul</div>
        <div className="app-org">{organization?.name}</div>
        <div className="app-topbar-right">
          <span className="app-user">{user.name}</span>
          <button className="btn-ghost" onClick={() => logout()}>
            Sign out
          </button>
        </div>
      </header>
      <div className="app-body">
        <nav className="app-sidebar">
          {NAV_GROUPS.map((group) => (
            <div className="app-nav-group" key={group.label}>
              <div className="app-nav-group-label">{group.label}</div>
              {group.links.map((link) => (
                <NavLink key={link.to} to={link.to} className={({ isActive }) => (isActive ? "active" : "")}>
                  {link.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
