import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { apiFetch, ApiError } from "../../lib/apiClient";
import type { User, Organization } from "../../types/api";

type AuthState = {
  user: User | null;
  organization: Organization | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (organizationName: string, ownerName: string, email: string, password: string) => Promise<void>;
  acceptInvite: (token: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ user: User; organization: Organization }>("/api/auth/me")
      .then((res) => {
        setUser(res.user);
        setOrganization(res.organization);
      })
      .catch((err) => {
        // A 401 here just means "not logged in yet" — not an error to report.
        if (!(err instanceof ApiError && err.status === 401)) console.error(err);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await apiFetch<{ user: User; organization: Organization }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(res.user);
    setOrganization(res.organization);
  }

  async function signup(organizationName: string, ownerName: string, email: string, password: string) {
    const res = await apiFetch<{ user: User; organization: Organization }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ organizationName, ownerName, email, password }),
    });
    setUser(res.user);
    setOrganization(res.organization);
  }

  async function acceptInvite(token: string, password: string) {
    const res = await apiFetch<{ user: User; organization: Organization }>("/api/team/invites/accept", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
    setUser(res.user);
    setOrganization(res.organization);
  }

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setOrganization(null);
  }

  return (
    <AuthContext.Provider value={{ user, organization, loading, login, signup, acceptInvite, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
