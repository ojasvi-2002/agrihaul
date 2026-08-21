import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider } from "./features/auth/AuthContext";
import { LoginPage } from "./features/auth/LoginPage";
import { SignupPage } from "./features/auth/SignupPage";
import { AcceptInvitePage } from "./features/auth/AcceptInvitePage";
import { AppLayout } from "./layouts/AppLayout";
import { ConversationsPage } from "./features/conversations/ConversationsPage";
import { PickupsPage } from "./features/pickups/PickupsPage";
import { FarmersPage } from "./features/farmers/FarmersPage";
import { FarmsPage } from "./features/farms/FarmsPage";
import { DriversPage } from "./features/drivers/DriversPage";
import { VehiclesPage } from "./features/vehicles/VehiclesPage";
import { MapPage } from "./features/map/MapPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { PlatformAdminAuthProvider } from "./features/platformAdmin/PlatformAdminAuthContext";
import { PlatformAdminLoginPage } from "./features/platformAdmin/PlatformAdminLoginPage";
import { PlatformAdminDashboardPage } from "./features/platformAdmin/PlatformAdminDashboardPage";
import { PlatformAdminOrganizationDetailPage } from "./features/platformAdmin/PlatformAdminOrganizationDetailPage";

// Two structurally independent trees: an organization user is never in
// PlatformAdminAuthProvider's tree and vice versa (CLAUDE.md §34 — keep
// platform admin and organization admin apart, not just by convention).
function OrgSection() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

function PlatformAdminSection() {
  return (
    <PlatformAdminAuthProvider>
      <Outlet />
    </PlatformAdminAuthProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<OrgSection />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route element={<AppLayout />}>
            <Route path="/conversations" element={<ConversationsPage />} />
            <Route path="/pickups" element={<PickupsPage />} />
            <Route path="/farmers" element={<FarmersPage />} />
            <Route path="/farms" element={<FarmsPage />} />
            <Route path="/drivers" element={<DriversPage />} />
            <Route path="/vehicles" element={<VehiclesPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route element={<PlatformAdminSection />}>
          <Route path="/platform-admin/login" element={<PlatformAdminLoginPage />} />
          <Route path="/platform-admin" element={<PlatformAdminDashboardPage />} />
          <Route path="/platform-admin/organizations/:id" element={<PlatformAdminOrganizationDetailPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/conversations" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
