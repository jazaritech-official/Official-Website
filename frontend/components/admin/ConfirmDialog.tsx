"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation dialog for destructive actions (accessible via Modal). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} label={title} size="sm" closeOnBackdrop={!busy}>
      <h2 className="pr-8 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted">{message}</p>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          onClick={onConfirm}
          className="!bg-danger hover:!bg-danger"
          data-autofocus
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
