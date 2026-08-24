import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { ApiError } from "../../lib/apiClient";

export function SignupPage() {
  const { user, loading, submitSignupRequest } = useAuth();
  const [organizationName, setOrganizationName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!loading && user) return <Navigate to="/conversations" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await submitSignupRequest(organizationName, ownerName, email);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>AgriHaul</h1>
          <p className="login-subtitle">Request received</p>
          <p>
            Thanks — we've received your request to create <strong>{organizationName}</strong>. An AgriHaul admin
            reviews every new organization before it's created; once approved, we'll email {email} with a link to
            set up your account.
          </p>
          <p className="login-footer-link">
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>AgriHaul</h1>
        <p className="login-subtitle">Request access for your organization</p>
        <p className="settings-note">
          New organizations are reviewed before they're created — submit your details below and we'll email you
          once approved.
        </p>

        <label>
          Organization name
          <input
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            placeholder="e.g. Green Farms"
            required
          />
        </label>

        <label>
          Your name
          <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required />
        </label>

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        {error && <p className="login-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Request access"}
        </button>

        <p className="login-footer-link">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
