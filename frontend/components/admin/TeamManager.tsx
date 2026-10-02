"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "./ConfirmDialog";
import { roleLabel } from "./AdminShell";
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  RefreshIcon,
  ShieldIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/icons";
import type { AdminRole, AdminTeamMember } from "@/types/api";

interface TeamData {
  selfId: string;
  selfRole: AdminRole;
  admins: AdminTeamMember[];
}

const PASSWORD_HINT = "At least 8 characters with upper and lower case letters and a number.";

function isStrong(value: string): boolean {
  return value.length >= 8 && value.length <= 200 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
}

/** Readable "last active" string — never throws on odd input. */
function formatDate(value?: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
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

/**
 * Super-Admin team management. The sidebar link and this view are UX only —
 * every action hits `/api/admin/team`, which is gated by
 * `requireRole("super_admin")` on the backend. Self and last-Super-Admin
 * protections are enforced server-side; this UI simply disables the obvious ones.
 */
export function TeamManager() {
  const { data, loading, error, run, setData } = useAsync<TeamData>(async () => {
    const [me, list] = await Promise.all([api.auth.me(), api.admin.team.list()]);
    return { selfId: me.id, selfRole: me.role, admins: list.admins };
  });

  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", email: "", role: "admin" as AdminRole, password: "" });

  // Reset password modal
  const [resetTarget, setResetTarget] = useState<AdminTeamMember | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<AdminTeamMember | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const admins = data?.admins ?? [];
  const selfId = data?.selfId;
  const selfRole = data?.selfRole;
  const activeSuperAdmins = admins.filter((a) => a.role === "super_admin" && a.isActive).length;

  /** Null-safe in-place update of the loaded admin list. */
  const updateAdmins = (updater: (list: AdminTeamMember[]) => AdminTeamMember[]) => {
    setData((current) => ({
      selfId: current?.selfId ?? "",
      selfRole: current?.selfRole ?? "admin",
      admins: updater(current?.admins ?? []),
    }));
  };

  const openCreate = () => {
    setCreateError(null);
    setDraft({ name: "", email: "", role: "admin", password: "" });
    setCreateOpen(true);
  };

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError(null);

    if (draft.name.trim().length < 2) return setCreateError("Enter the administrator's name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(draft.email.trim())) return setCreateError("Enter a valid email address.");
    if (!isStrong(draft.password)) return setCreateError(PASSWORD_HINT);

    setCreating(true);
    try {
      const result = await api.admin.team.create({
        name: draft.name.trim(),
        email: draft.email.trim(),
        role: draft.role,
        password: draft.password,
      });
      updateAdmins((list) => [...list, result.admin]);
      setCreateOpen(false);
      setNotice(`Administrator ${result.admin.email} was created.`);
    } catch (cause) {
      setCreateError(cause instanceof ApiError ? cause.message : "Could not create this administrator.");
    } finally {
      setCreating(false);
    }
  };

  const changeRole = async (member: AdminTeamMember, role: AdminRole) => {
    if (role === member.role) return;
    setActionError(null);
    setRowBusy(member.id);
    try {
      const result = await api.admin.team.updateRole(member.id, role);
      updateAdmins((list) => list.map((a) => (a.id === member.id ? result.admin : a)));
      setNotice(`${result.admin.email} is now ${roleLabel(result.admin.role)}.`);
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : "Could not change this role.");
    } finally {
      setRowBusy(null);
    }
  };

  const toggleActive = async (member: AdminTeamMember) => {
    setActionError(null);
    setRowBusy(member.id);
    try {
      const result = await api.admin.team.setActive(member.id, !member.isActive);
      updateAdmins((list) => list.map((a) => (a.id === member.id ? result.admin : a)));
      setNotice(`${result.admin.email} was ${result.admin.isActive ? "activated" : "deactivated"}.`);
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : "Could not update this administrator.");
    } finally {
      setRowBusy(null);
    }
  };

  const openReset = (member: AdminTeamMember) => {
    setResetError(null);
    setResetPassword("");
    setResetTarget(member);
  };

  const submitReset = async (event: FormEvent) => {
    event.preventDefault();
    if (!resetTarget) return;
    if (!isStrong(resetPassword)) {
      setResetError(PASSWORD_HINT);
      return;
    }
    setResetting(true);
    setResetError(null);
    try {
      await api.admin.team.resetPassword(resetTarget.id, resetPassword);
      setNotice(`Password reset for ${resetTarget.email}. Share the new password securely.`);
      setResetTarget(null);
    } catch (cause) {
      setResetError(cause instanceof ApiError ? cause.message : "Could not reset this password.");
    } finally {
      setResetting(false);
    }
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleting(true);
    setActionError(null);
    try {
      await api.admin.team.remove(target.id);
      updateAdmins((list) => list.filter((a) => a.id !== target.id));
      setNotice(`${target.email} was removed.`);
      setDeleteTarget(null);
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : "Could not delete this administrator.");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-16 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Team could not be loaded"
        description={error.message}
        icon={<RefreshIcon size={22} />}
        action={
          <Button variant="outline" size="sm" onClick={() => void run()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (selfRole !== "super_admin") {
    return (
      <EmptyState
        title="Super Admin access required"
        description="Team management is available to Super Admins only."
        icon={<ShieldIcon size={22} />}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold">Administrators</h2>
          <p className="mt-1 text-sm text-muted">
            Manage who can access the portal and at what level. Every change here is recorded and
            enforced by the backend.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} iconLeft={<PlusIcon size={14} />}>
          Add administrator
        </Button>
      </div>

      {notice && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-growth/40 bg-growth/10 px-4 py-3 text-sm text-growth-ink"
        >
          <CheckIcon size={15} />
          {notice}
        </p>
      )}

      {actionError && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <caption className="sr-only">Administrator accounts and their roles</caption>
            <thead>
              <tr className="border-b border-line bg-surface-elevated text-left text-xs uppercase tracking-[0.12em] text-muted">
                <th scope="col" className="px-4 py-3 font-semibold">Administrator</th>
                <th scope="col" className="px-4 py-3 font-semibold">Role</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold">Last sign-in</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((member) => {
                const isSelf = member.id === selfId;
                const isLastSuper = member.role === "super_admin" && activeSuperAdmins <= 1 && member.isActive;
                const busy = rowBusy === member.id;
                return (
                  <tr key={member.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-foreground">
                        {member.name || "—"}
                        {isSelf && <span className="ml-2 text-xs font-normal text-muted">(you)</span>}
                      </p>
                      <p className="truncate text-xs text-muted" title={member.email}>{member.email}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <label className="sr-only" htmlFor={`role-${member.id}`}>
                        Role for {member.email}
                      </label>
                      <select
                        id={`role-${member.id}`}
                        className="field h-9 w-36 py-0 text-xs"
                        value={member.role}
                        disabled={isSelf || busy}
                        onChange={(event) => void changeRole(member, event.target.value as AdminRole)}
                      >
                        <option value="admin">Admin</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={member.isActive ? "success" : "neutral"} icon={member.isActive ? <CheckIcon size={12} /> : undefined}>
                        {member.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted">{formatDate(member.lastLoginAt)}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openReset(member)}
                          disabled={busy}
                        >
                          Reset password
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void toggleActive(member)}
                          disabled={isSelf || busy || isLastSuper}
                          title={isLastSuper ? "The last active Super Admin cannot be deactivated." : undefined}
                        >
                          {member.isActive ? "Deactivate" : "Activate"}
                        </Button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon text-danger hover:text-danger"
                          aria-label={`Delete ${member.email}`}
                          disabled={isSelf || busy || (isLastSuper && member.role === "super_admin")}
                          title={isSelf ? "You cannot delete your own account." : undefined}
                          onClick={() => setDeleteTarget(member)}
                        >
                          <TrashIcon size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {admins.length === 0 && (
        <EmptyState
          title="No administrators yet"
          description="Add the first administrator to let your team manage content."
          icon={<UsersIcon size={22} />}
        />
      )}

      {/* Create */}
      <Modal open={createOpen} onClose={() => (creating ? undefined : setCreateOpen(false))} label="Add administrator" size="md">
        <form onSubmit={submitCreate} noValidate className="space-y-4">
          <h2 className="pr-8 text-lg font-semibold text-foreground">Add administrator</h2>

          {createError && (
            <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
              {createError}
            </p>
          )}

          <div>
            <label htmlFor="team-name" className="label">Full name</label>
            <input
              id="team-name"
              className="field"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              disabled={creating}
              data-autofocus
            />
          </div>

          <div>
            <label htmlFor="team-email" className="label">Email</label>
            <input
              id="team-email"
              type="email"
              className="field"
              value={draft.email}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              disabled={creating}
            />
          </div>

          <div>
            <label htmlFor="team-role" className="label">Role</label>
            <select
              id="team-role"
              className="field"
              value={draft.role}
              onChange={(event) => setDraft({ ...draft, role: event.target.value as AdminRole })}
              disabled={creating}
            >
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>

          <PasswordField
            id="team-password"
            label="Temporary password"
            value={draft.password}
            onChange={(value) => setDraft({ ...draft, password: value })}
            disabled={creating}
          />
          <p className="text-xs text-muted">{PASSWORD_HINT}</p>

          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={creating}>
              {creating ? "Creating…" : "Create administrator"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset password */}
      <Modal open={resetTarget !== null} onClose={() => (resetting ? undefined : setResetTarget(null))} label="Reset password" size="sm">
        <form onSubmit={submitReset} noValidate className="space-y-4">
          <h2 className="pr-8 text-lg font-semibold text-foreground">Reset password</h2>
          <p className="text-sm text-muted">
            Set a new password for <span className="font-medium text-foreground">{resetTarget?.email}</span>. It is
            never displayed or logged — share it with them securely.
          </p>

          {resetError && (
            <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
              {resetError}
            </p>
          )}

          <PasswordField
            id="reset-password"
            label="New password"
            value={resetPassword}
            onChange={setResetPassword}
            disabled={resetting}
          />
          <p className="text-xs text-muted">{PASSWORD_HINT}</p>

          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <Button variant="ghost" size="sm" onClick={() => setResetTarget(null)} disabled={resetting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={resetting}>
              {resetting ? "Saving…" : "Reset password"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this administrator?"
        message={`${deleteTarget?.email ?? "This administrator"} will lose access immediately. This cannot be undone.`}
        confirmLabel="Delete administrator"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default TeamManager;
