"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { CheckIcon, CopyIcon } from "@/components/icons";

interface SuccessModalProps {
  open: boolean;
  referenceId: string;
  /** The service the visitor chose — shown back to them as confirmation. */
  service?: string;
  /** Primary action — returns the visitor to the page they came from. */
  onBackHome: () => void;
  /** Secondary action — clears the form and starts a fresh brief. */
  onSendAnother: () => void;
  onClose: () => void;
}

/** Fixed confetti geometry — no random values, so renders stay stable. */
const PARTICLES = [
  { x: -78, y: -86, r: 140, color: "var(--accent)", delay: 0 },
  { x: 64, y: -96, r: -120, color: "var(--primary)", delay: 40 },
  { x: -104, y: -30, r: 210, color: "var(--growth)", delay: 80 },
  { x: 96, y: -24, r: -180, color: "var(--slate)", delay: 20 },
  { x: -60, y: 78, r: 160, color: "var(--primary)", delay: 120 },
  { x: 74, y: 70, r: -140, color: "var(--accent)", delay: 60 },
  { x: -18, y: -110, r: 90, color: "var(--growth)", delay: 100 },
  { x: 24, y: 96, r: -90, color: "var(--slate)", delay: 140 },
  { x: -120, y: 20, r: 250, color: "var(--accent)", delay: 30 },
  { x: 118, y: 34, r: -250, color: "var(--growth)", delay: 90 },
  { x: -40, y: -60, r: 120, color: "var(--primary)", delay: 160 },
  { x: 46, y: -52, r: -160, color: "var(--accent)", delay: 110 },
] as const;

/** The three fixed post-submission stages. Copy only — no invented promises. */
const NEXT_STEPS = [
  { title: "Received", copy: "Your brief is stored with the reference ID above." },
  { title: "We review", copy: "An engineer reads it and scopes the work." },
  { title: "We contact you", copy: "You get a reply with scope, timeline and next steps." },
] as const;

/**
 * Premium success dialog: stroke-drawn check, brand-only confetti, the
 * backend-generated reference ID (with copy), the chosen service, a three-step
 * "what happens next" timeline and two explicit exits. Confetti is suppressed
 * entirely under `prefers-reduced-motion`. Focus trap + Escape come from Modal.
 */
export function SuccessModal({
  open,
  referenceId,
  service,
  onBackHome,
  onSendAnother,
  onClose,
}: SuccessModalProps) {
  const [copied, setCopied] = useState(false);
  const reduced = useReducedMotion();
  const particles = useMemo(() => (open && !reduced ? PARTICLES : []), [open, reduced]);

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(referenceId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable (insecure context) — the ID is visible for manual copy.
    }
  };

  return (
    <Modal open={open} onClose={onClose} label="Request received" showClose>
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="relative flex size-20 items-center justify-center">
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border-2 border-growth"
            style={{ animation: "jt-ring-pulse 1400ms var(--ease-out) forwards" }}
          />
          <span className="flex size-16 items-center justify-center rounded-full bg-growth/15 text-growth">
            <CheckIcon size={30} animated="draw" />
          </span>

          <span aria-hidden="true" className="absolute inset-0">
            {particles.map((particle, index) => (
              <span
                key={index}
                className="confetti-piece"
                style={
                  {
                    "--confetti-x": `${particle.x}px`,
                    "--confetti-y": `${particle.y}px`,
                    "--confetti-r": `${particle.r}deg`,
                    "--confetti-color": particle.color,
                    "--confetti-delay": `${particle.delay}ms`,
                  } as React.CSSProperties
                }
              />
            ))}
          </span>
        </div>

        <div>
          <h2 data-autofocus tabIndex={-1} className="text-xl font-semibold text-foreground">
            Request received
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
            Thanks — your brief is with our team. A Jazari Tech specialist will contact you soon to
            confirm scope, timeline and next steps.
          </p>
        </div>

        <div className="flex w-full max-w-sm flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">
            Reference ID
          </span>
          <div className="flex items-center gap-2">
            <code className="font-mono text-sm font-semibold text-foreground">{referenceId}</code>
            <button
              type="button"
              onClick={copyReference}
              className="btn btn-ghost btn-icon !p-1.5 text-muted"
              aria-label={copied ? "Reference ID copied" : "Copy reference ID"}
            >
              <CopyIcon size={14} />
            </button>
          </div>
          <span className="sr-only" role="status">
            {copied ? "Reference ID copied to clipboard" : ""}
          </span>
          {copied ? <span className="text-[0.7rem] text-growth-ink">Copied to clipboard</span> : null}
        </div>

        {service ? (
          <p className="text-xs text-muted">
            Requested service: <span className="font-semibold text-foreground">{service}</span>
          </p>
        ) : null}

        <ol className="success-next-steps w-full max-w-sm">
          {NEXT_STEPS.map((stage, index) => (
            <li key={stage.title} className="success-next-step">
              <span className="success-next-step__num" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <span className="success-next-step__title">{stage.title}</span>
                <span className="success-next-step__copy">{stage.copy}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={onBackHome} className="w-full sm:w-auto">
            Back to home
          </Button>
          <Button variant="outline" onClick={onSendAnother} className="w-full sm:w-auto">
            Send another
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default SuccessModal;
