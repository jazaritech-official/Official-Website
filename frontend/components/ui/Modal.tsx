"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/icons";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Accessible name for the dialog (aria-labelledby target text). */
  label?: string;
  size?: "sm" | "md" | "lg";
  showClose?: boolean;
  closeOnBackdrop?: boolean;
  className?: string;
}

const SIZE_CLASS = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" } as const;

/**
 * Dialog semantics with focus trap, Escape-to-close, scroll lock and focus
 * restoration. Rendered through a portal so it never breaks stacking contexts.
 */
export function Modal({
  open,
  onClose,
  children,
  label = "Dialog",
  size = "md",
  showClose = true,
  closeOnBackdrop = true,
  className = "",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  // Portals only render in the browser; modals always open after hydration
  // (open=false during SSR), so server and client output match.
  const canUseDom = typeof document !== "undefined";

  // Keep the latest close handler without re-running the focus effect.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;

    const focusTimer = window.setTimeout(() => {
      const preferred = panel?.querySelector<HTMLElement>("[data-autofocus]");
      const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
      (preferred ?? first ?? panel)?.focus();
    }, 40);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !panel) return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open || !canUseDom) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center overflow-y-auto p-4 sm:p-6"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-[3px]" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`card relative my-auto w-full ${SIZE_CLASS[size]} max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-[var(--shadow-elevated)] ${className}`.trim()}
      >
        {showClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="btn btn-ghost btn-icon absolute right-4 top-4 text-muted"
          >
            <CloseIcon size={18} />
          </button>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export default Modal;
