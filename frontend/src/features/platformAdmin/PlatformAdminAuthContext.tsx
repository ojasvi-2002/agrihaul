// Deliberately NOT the org-user AuthContext — a platform admin has no
// "current organization" and authenticates via a completely separate
// backend cookie/session realm (CLAUDE.md §34). Mixing the two contexts
// would be exactly the kind of blur CLAUDE.md says to avoid.
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { apiFetch, ApiError } from "../../lib/apiClient";
import type { PlatformAdmin } from "../../types/api";

type PlatformAdminAuthState = {
  admin: PlatformAdmin | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const PlatformAdminAuthContext = createContext<PlatformAdminAuthState | null>(null);

export function PlatformAdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<PlatformAdmin | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ admin: PlatformAdmin }>("/api/platform-admin/auth/me")
      .then((res) => setAdmin(res.admin))
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) console.error(err);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await apiFetch<{ admin: PlatformAdmin }>("/api/platform-admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setAdmin(res.admin);
  }

  async function logout() {
    await apiFetch("/api/platform-admin/auth/logout", { method: "POST" });
    setAdmin(null);
  }

  return (
    <PlatformAdminAuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </PlatformAdminAuthContext.Provider>
  );
}

export function usePlatformAdminAuth() {
  const ctx = useContext(PlatformAdminAuthContext);
  if (!ctx) throw new Error("usePlatformAdminAuth must be used within PlatformAdminAuthProvider");
  return ctx;
}
