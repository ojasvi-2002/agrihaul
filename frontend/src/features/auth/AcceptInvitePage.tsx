import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { apiFetch, ApiError } from "../../lib/apiClient";

type InvitePreview = { name: string; email: string; role: string; organizationName: string };

export function AcceptInvitePage() {
  const { user, loading, acceptInvite } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setPreviewError("This invite link is missing its token.");
      setLoadingPreview(false);
      return;
    }
    apiFetch<InvitePreview>(`/api/team/invites/preview?token=${encodeURIComponent(token)}`)
      .then(setPreview)
      .catch((err) => setPreviewError(err instanceof ApiError ? err.message : "Failed to load invite"))
      .finally(() => setLoadingPreview(false));
  }, [token]);

  if (!loading && user) return <Navigate to="/conversations" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (password !== confirmPassword) {
      setSubmitError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await acceptInvite(token, password);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Failed to accept invite");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>AgriHaul</h1>

        {loadingPreview && <p className="login-subtitle">Loading invite…</p>}

        {!loadingPreview && previewError && (
          <>
            <p className="login-error">{previewError}</p>
            <p className="login-footer-link">
              <Link to="/login">Back to sign in</Link>
            </p>
          </>
        )}

        {!loadingPreview && preview && (
          <form onSubmit={handleSubmit}>
            <p className="login-subtitle">
              You've been invited to join <strong>{preview.organizationName}</strong> as {preview.role}.
            </p>

            <label>
              Name
              <input value={preview.name} disabled />
            </label>

            <label>
              Email
              <input value={preview.email} disabled />
            </label>

            <label>
              Choose a password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>

            <label>
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>

            {submitError && <p className="login-error">{submitError}</p>}

            <button type="submit" disabled={submitting}>
              {submitting ? "Joining…" : "Accept invite & sign in"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
