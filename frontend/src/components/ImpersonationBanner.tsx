import { useState } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { ApiError } from "../lib/apiClient";

// Persistent, impossible-to-miss strip — this must never look like a
// normal part of the UI, so an OWNER/ADMIN always knows they're acting
// as someone else, not themselves. See notes.png's "view as" requirement.
export function ImpersonationBanner() {
  const { user, stopViewingAs } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user?.impersonatedBy) return null;

  async function handleReturn() {
    setBusy(true);
    setError(null);
    try {
      await stopViewingAs();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to return to your account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="impersonation-banner">
      <span>
        Viewing as <strong>{user.name}</strong> ({user.role})
      </span>
      {error && <span className="impersonation-banner-error">{error}</span>}
      <button className="btn-ghost btn-sm" disabled={busy} onClick={handleReturn}>
        Return to your account
      </button>
    </div>
  );
}
