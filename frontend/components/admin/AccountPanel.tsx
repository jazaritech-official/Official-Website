"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Spinner";
import { CheckIcon, EyeIcon, EyeOffIcon, ShieldIcon } from "@/components/icons";
import { roleLabel } from "./AdminShell";
import type { AdminSession } from "@/types/api";

const PASSWORD_HINT = "At least 8 characters with upper and lower case letters and a number.";

function isStrong(value: string): boolean {
  return value.length >= 8 && value.length <= 200 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
}

function PasswordInput({
  id,
  label,
  autoComplete,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          className="field pr-11"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          placeholder="••••••••"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted transition-colors hover:text-foreground"
        >
          {visible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
        </button>
      </div>
    </div>
  );
}

/** Self-service password change for the signed-in administrator. */
export function AccountPanel() {
  const { data: admin, loading } = useAsync<AdminSession>(() => api.auth.me());

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSuccess(false);

    if (!currentPassword) return setFormError("Enter your current password.");
    if (!isStrong(newPassword)) return setFormError(PASSWORD_HINT);
    if (newPassword !== confirmPassword) return setFormError("The new passwords do not match.");
    if (newPassword === currentPassword) return setFormError("Choose a password different from your current one.");

    setSaving(true);
    try {
      await api.auth.changePassword({ currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : "Could not update your password.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-64 rounded-2xl" />;
  }

  return (
    <div className="grid max-w-4xl gap-6 lg:grid-cols-[1fr_1.2fr]">
      {/* Profile summary */}
      <section className="card h-fit p-5 sm:p-6">
        <h2 className="text-base font-semibold">Your account</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-muted">Name</dt>
            <dd className="mt-0.5 text-foreground">{admin?.name || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-muted">Email</dt>
            <dd className="mt-0.5 break-all text-foreground">{admin?.email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-muted">Role</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${
                  admin?.role === "super_admin"
                    ? "border-accent/35 bg-accent-soft text-accent"
                    : "border-line bg-surface-elevated text-muted"
                }`}
              >
                <ShieldIcon size={12} />
                {roleLabel(admin?.role)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-muted">Status</dt>
            <dd className="mt-0.5 text-foreground">{admin?.isActive ? "Active" : "Inactive"}</dd>
          </div>
        </dl>
      </section>

      {/* Change password */}
      <section className="card p-5 sm:p-6">
        <h2 className="text-base font-semibold">Change password</h2>
        <p className="mt-1 text-sm text-muted">
          Choose a strong password. You will stay signed in on this device.
        </p>

        {success && (
          <p role="status" className="mt-4 flex items-center gap-2 rounded-xl border border-growth/40 bg-growth/10 px-3.5 py-2.5 text-sm text-growth-ink">
            <CheckIcon size={15} />
            Password updated.
          </p>
        )}

        {formError && (
          <p role="alert" className="mt-4 rounded-xl border border-danger/40 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            {formError}
          </p>
        )}

        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          <PasswordInput
            id="current-password"
            label="Current password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
            disabled={saving}
          />
          <PasswordInput
            id="new-password"
            label="New password"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
            disabled={saving}
          />
          <PasswordInput
            id="confirm-password"
            label="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            disabled={saving}
          />
          <p className="text-xs text-muted">{PASSWORD_HINT}</p>

          <div className="flex justify-end border-t border-line pt-4">
            <Button type="submit" size="sm" loading={saving}>
              {saving ? "Updating…" : "Update password"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default AccountPanel;
