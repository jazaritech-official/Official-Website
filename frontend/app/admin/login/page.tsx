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

export default function AdminLoginPage() {
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
      router.replace("/admin/dashboard");
    } catch (cause) {
      // Generic message only — never reveals whether the account exists.
      setFormError(
        cause instanceof ApiError ? cause.message : "Unable to sign in right now. Please try again.",
      );
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
          <Logo variant="horizontal" sizes="220px" className="h-9 w-auto" />
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

        <p className="mt-6 text-center text-xs text-muted">
          <Link href="/" className="transition-colors hover:text-foreground">
            ← Back to jazaritech.com
          </Link>
        </p>
      </div>
    </div>
  );
}
