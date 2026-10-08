"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Logo } from "@/components/brand/Logo";
import { EyeIcon, EyeOffIcon, ShieldIcon } from "@/components/icons";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const CREDENTIALS_ERROR = "Email or password is incorrect.";
const SERVICE_ERROR = "We couldn't reach the authentication service right now. Please try again.";
const DEACTIVATED_ERROR = "This account has been deactivated. Please contact a Super Admin.";
const RATE_LIMIT_ERROR = "Too many sign-in attempts. Please wait a few minutes and try again.";
// The same-origin /api proxy is not configured (no BACKEND_ORIGIN) — the honest,
// non-blaming message. Without it, a browser talks to the API cross-site and the
// session cookie is stored but never sent back, which looks like "signed in, but
// your browser did not keep the session". The configuration is owner-side.
const CONFIG_ERROR =
  "Sign-in is temporarily unavailable: the authentication service is not configured. " +
  "Please try again later or contact the site owner.";
// Credentials were accepted (login 200) but the session cookie did not stick.
const SESSION_COOKIE_ERROR =
  "Signed in, but your browser did not keep the session. Check that cookies are allowed for this site, then try again.";

/**
 * Status-aware login messaging.
 *
 *  - 401 (and 403, the deactivated-account case the backend returns AFTER valid
 *    credentials) always maps to the generic credential message — never
 *    reveals whether the account exists.
 *  - The authentication service being unreachable or unhealthy (503
 *    DATABASE_UNAVAILABLE, any 5xx, or a network failure) must NEVER look like
 *    invalid credentials.
 *  - 503 CONFIG_MISSING means the frontend has no backend origin configured;
 *    it gets its own clear message, distinct from "wrong password".
 *  - 429 gets its own rate-limit message.
 */
function loginErrorMessage(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.code === "CONFIG_MISSING") return CONFIG_ERROR;
    if (cause.status === 401) return CREDENTIALS_ERROR;
    if (cause.status === 403) return cause.message || DEACTIVATED_ERROR;
    if (cause.status === 429) return RATE_LIMIT_ERROR;
    if (cause.status >= 500 || cause.code === "DATABASE_UNAVAILABLE") return SERVICE_ERROR;
    if (cause.status === 0 || cause.code === "NETWORK_ERROR") return SERVICE_ERROR;
    return cause.message || SERVICE_ERROR;
  }
  return SERVICE_ERROR;
}

export interface AdminLoginFormProps {
  /**
   * Mirrors the server-side `DIAGNOSTICS` flag so the footer hint and the
   * `/api/diag-session` route can never disagree. Purely informational.
   */
  diagnosticsEnabled?: boolean;
}

export default function AdminLoginForm({ diagnosticsEnabled = false }: AdminLoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Already authenticated? Go straight to the dashboard.
  useEffect(() => {
    let active = true;
    api.auth
      .me()
      .then(() => {
        if (active) router.replace("/admin/dashboard");
      })
      .catch(() => {
        // Not signed in — stay on the login form.
      });
    return () => {
      active = false;
    };
  }, [router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const nextErrors: { email?: string; password?: string } = {};
    if (!EMAIL_RE.test(email.trim())) nextErrors.email = "Enter a valid email address.";
    if (!password) nextErrors.password = "Password is required.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setFormError(null);

    try {
      await api.auth.login(email.trim(), password);

      // Confirm the session cookie was actually stored before navigating. If the
      // cookie is dropped (cross-site API, blocked third-party cookies, a proxy
      // that strips Set-Cookie), redirecting here would just bounce the user
      // back to this page with a confusing error, so we verify first.
      try {
        await api.auth.me();
      } catch (verifyCause) {
        submittingRef.current = false;
        setSubmitting(false);
        setFormError(
          verifyCause instanceof ApiError && verifyCause.status === 401
            ? SESSION_COOKIE_ERROR
            : loginErrorMessage(verifyCause),
        );
        if (verifyCause instanceof ApiError && verifyCause.status === 401) {
          // Diagnostic hint only — no secrets, no token contents.
          console.warn(
            "[jazari] Login returned 200 but /auth/me returned 401: the session cookie was not stored or not sent. " +
              "Serve the app same-origin with the /api proxy (BACKEND_ORIGIN), and allow cookies for this site.",
          );
        }
        return;
      }

      router.replace("/admin/dashboard");
    } catch (cause) {
      // Distinguish credential failures from service/network failures — never
      // reveals whether the account exists.
      setFormError(loginErrorMessage(cause));
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,color-mix(in_srgb,var(--accent)_12%,transparent),transparent)]"
      />

      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <Logo variant="full" sizes="104px" className="h-10" />
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <ShieldIcon size={13} className="text-growth" />
            Secure administration area
          </p>
        </div>

        <form onSubmit={onSubmit} noValidate className="card p-6 sm:p-7">
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted">Use your administrator credentials.</p>

          {formError && (
            <p role="alert" className="mt-4 rounded-xl border border-danger/40 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
              {formError}
            </p>
          )}

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="admin-email" className="label">
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                autoComplete="username"
                className="field"
                placeholder="admin@jazaritech.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setErrors((current) => ({ ...current, email: undefined }));
                }}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "admin-email-error" : undefined}
              />
              {errors.email && (
                <p id="admin-email-error" className="error-text">
                  {errors.email}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="admin-password" className="label">
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="field pr-11"
                  placeholder="••••••••••"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setErrors((current) => ({ ...current, password: undefined }));
                  }}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "admin-password-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted transition-colors hover:text-foreground"
                >
                  {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
              {errors.password && (
                <p id="admin-password-error" className="error-text">
                  {errors.password}
                </p>
              )}
            </div>
          </div>

          <Button type="submit" loading={submitting} className="mt-6 w-full">
            {submitting ? "Verifying…" : "Sign in"}
          </Button>

          <p className="mt-4 text-center text-xs text-muted">
            Sessions use a secure, httpOnly cookie.
          </p>
        </form>

        {/* Shown only while the temporary DIAGNOSTICS flag is on. The flag is read
            on the server, so the hint and /api/diag-session can never disagree. */}
        {diagnosticsEnabled && (
          <p className="mt-4 text-center text-xs text-muted" data-diagnostics-hint="on">
            Diagnostics are on — see{" "}
            <a href="/api/diag-session" className="underline transition-colors hover:text-foreground">
              /api/diag-session
            </a>
          </p>
        )}

        <p className="mt-6 text-center text-xs text-muted">
          <Link href="/" className="transition-colors hover:text-foreground">
            ← Back to jazaritech.com
          </Link>
        </p>
      </div>
    </div>
  );
}
