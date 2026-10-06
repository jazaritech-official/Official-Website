"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Spinner";
import { Reveal } from "@/components/motion/Reveal";
import { SectionIndex } from "@/components/layout/SectionIndex";
import { SuccessModal } from "./SuccessModal";
import {
  ArrowRightIcon,
  CheckIcon,
  HandshakeIcon,
  LightbulbIcon,
  RefreshIcon,
  ShieldIcon,
} from "@/components/icons";
import type { SubmissionResult } from "@/types/api";

const STEP_LABELS = ["Your name", "Your work", "Contact", "Service"] as const;
const LAST_STEP = STEP_LABELS.length - 1;

interface FormState {
  name: string;
  domain: string;
  phone: string;
  email: string;
  service: string;
  /** Honeypot field — must stay empty for humans. */
  website: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9][0-9\s\-().]{6,19}$/;

const EMPTY_FORM: FormState = {
  name: "",
  domain: "",
  phone: "",
  email: "",
  service: "",
  website: "",
};

const PROMISES: { icon: typeof ShieldIcon; title: string; copy: string }[] = [
  {
    icon: LightbulbIcon,
    title: "Reviewed by engineers",
    copy: "Every brief is read by the people who would actually build it.",
  },
  {
    icon: HandshakeIcon,
    title: "No-obligation scoping",
    copy: "You get a clear scope, timeline and next step — not a hard sell.",
  },
  {
    icon: ShieldIcon,
    title: "Your details stay private",
    copy: "Contact information is used for this conversation only.",
  },
];

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="error-text">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Section 6 — guided intake.
 *
 * Four conversational steps (name → work → contact → service), per-step
 * validation, a honeypot for bots, backend-confirmed submission and a premium
 * success dialog showing the server-generated reference ID.
 */
export function StartProjectForm() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmissionResult | null>(null);

  const submittingRef = useRef(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const servicesState = useApiData(() => api.services(), "form-services");

  // Move focus to the new step's heading (not on first paint).
  useEffect(() => {
    if (step > 0) stepHeadingRef.current?.focus();
  }, [step]);

  const setField = (field: keyof typeof EMPTY_FORM, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const validateStep = (index: number): Record<string, string> => {
    const found: Record<string, string> = {};

    if (index === 0 && form.name.trim().length < 2) {
      found.name = "Please enter your name (at least 2 characters).";
    }

    if (index === 2) {
      const email = form.email.trim();
      const phone = form.phone.trim();
      if (!email && !phone) {
        found.contact = "Provide at least a phone number or an email address.";
      } else {
        if (email && !EMAIL_RE.test(email)) found.email = "Enter a valid email address.";
        if (phone && !PHONE_RE.test(phone)) found.phone = "Enter a valid phone number.";
      }
    }

    if (index === 3 && !form.service) {
      found.service = "Choose the service you need.";
    }

    return found;
  };

  const goToStep = (index: number) => {
    setErrors({});
    setSubmitError(null);
    setStep(index);
  };

  const handleNext = () => {
    const found = validateStep(step);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    goToStep(Math.min(step + 1, LAST_STEP));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (step < LAST_STEP) {
      handleNext();
      return;
    }

    const found = validateStep(LAST_STEP);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    // Guard against accidental double submission.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const submission = await api.submitProject({
        name: form.name.trim(),
        domain: form.domain.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        service: form.service,
        website: form.website,
      });
      setResult(submission);
    } catch (cause) {
      if (cause instanceof ApiError && cause.details && Object.keys(cause.details).length > 0) {
        setErrors(cause.details);
        const fieldSteps: Record<string, number> = { name: 0, domain: 1, phone: 2, email: 2, contact: 2, service: 3 };
        const targetStep = Math.min(...Object.keys(cause.details).map((field) => fieldSteps[field] ?? LAST_STEP));
        setStep(targetStep);
      } else {
        setSubmitError(
          cause instanceof ApiError ? cause.message : "Something went wrong. Please try again.",
        );
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const closeSuccess = () => {
    setResult(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setSubmitError(null);
    setStep(0);
  };

  const services = servicesState.data ?? [];
  const servicesLoading = servicesState.loading;

  return (
    <section id="start" aria-labelledby="start-heading" className="relative overflow-hidden py-16 sm:py-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-surface"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 left-1/2 -z-10 h-96 w-96 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_14%,transparent),transparent_70%)]"
      />

      <div className="container-page grid items-start gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        {/* -------- Copy -------- */}
        <div className="lg:sticky lg:top-28">
          <Reveal variant="fade-in">
            <SectionIndex index="04" label="Start" className="mb-4" />
            <p className="eyebrow">Start Your Project</p>
          </Reveal>
          <Reveal delay={80}>
            <h2 id="start-heading" className="mt-3 text-h3 font-semibold">
              Tell us what you want to build
            </h2>
            <span aria-hidden="true" className="heading-rule mt-4" />
          </Reveal>
          <Reveal delay={150}>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
              Four short steps — no account, no forms to print. We reply with an honest scope,
              timeline and the person who would lead the work.
            </p>
          </Reveal>

          <Reveal delay={220}>
            <ul className="mt-8 flex flex-col gap-5">
              {PROMISES.map(({ icon: Icon, title, copy }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-elevated text-accent shadow-[var(--shadow-subtle)]">
                    <Icon size={18} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{title}</span>
                    <span className="mt-0.5 block text-sm text-muted">{copy}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        {/* -------- Stepper -------- */}
        <Reveal delay={120}>
          <form onSubmit={handleSubmit} noValidate className="card relative p-6 sm:p-8">
            {/* Progress */}
            <div className="flex items-center justify-between gap-4">
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted">
                Step {step + 1} of {STEP_LABELS.length}
              </span>
              <span className="text-xs font-medium text-foreground">{STEP_LABELS[step]}</span>
            </div>

            <div
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={STEP_LABELS.length}
              aria-valuenow={step + 1}
              aria-label="Project brief progress"
              className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
            >
              <div
                className="h-full origin-left rounded-full bg-accent transition-transform duration-500 ease-out"
                style={{ transform: `scaleX(${(step + 1) / STEP_LABELS.length})` }}
              />
            </div>

            {/* Step dots */}
            <ol className="mt-4 flex items-center gap-2" aria-hidden="true">
              {STEP_LABELS.map((label, index) => (
                <li
                  key={label}
                  className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                    index <= step ? "bg-accent" : "bg-surface-sunken"
                  }`}
                />
              ))}
            </ol>

            {/* Fields */}
            <div key={step} className="step-enter mt-7 min-h-[16.5rem]">
              <h3 ref={stepHeadingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
                {step === 0 && "Who are we speaking with?"}
                {step === 1 && "What are you working on?"}
                {step === 2 && "How should we reach you?"}
                {step === 3 && "What do you need built?"}
              </h3>

              {step === 0 && (
                <div className="mt-5">
                  <Field id="jt-name" label="Full name" error={errors.name} hint="So we know who to ask for.">
                    <input
                      id="jt-name"
                      type="text"
                      autoComplete="name"
                      className="field"
                      placeholder="Amina Rahman"
                      value={form.name}
                      onChange={(event) => setField("name", event.target.value)}
                      aria-invalid={Boolean(errors.name)}
                      aria-describedby={errors.name ? "jt-name-error" : undefined}
                    />
                  </Field>
                </div>
              )}

              {step === 1 && (
                <div className="mt-5">
                  <Field
                    id="jt-domain"
                    label="Company, domain or work"
                    hint="Optional — a company name, website or what you do helps us tailor the reply."
                    error={errors.domain}
                  >
                    <input
                      id="jt-domain"
                      type="text"
                      autoComplete="organization"
                      className="field"
                      placeholder="example.com or your company name"
                      value={form.domain}
                      onChange={(event) => setField("domain", event.target.value)}
                      aria-invalid={Boolean(errors.domain)}
                      aria-describedby={errors.domain ? "jt-domain-error" : undefined}
                    />
                  </Field>
                </div>
              )}

              {step === 2 && (
                <div className="mt-5 space-y-5">
                  <p className="text-sm text-muted">
                    Give us either a phone number or an email — whichever you prefer replying on.
                  </p>
                  <Field
                    id="jt-phone"
                    label="Phone"
                    error={errors.phone}
                    hint={errors.contact ? undefined : "Include the country code when possible."}
                  >
                    <input
                      id="jt-phone"
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      className="field"
                      placeholder="+880 1712 345678"
                      value={form.phone}
                      onChange={(event) => setField("phone", event.target.value)}
                      aria-invalid={Boolean(errors.phone || errors.contact)}
                      aria-describedby={
                        errors.phone ? "jt-phone-error" : errors.contact ? "contact-error" : undefined
                      }
                    />
                  </Field>

                  <Field id="jt-email" label="Email" error={errors.email}>
                    <input
                      id="jt-email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      className="field"
                      placeholder="you@company.com"
                      value={form.email}
                      onChange={(event) => setField("email", event.target.value)}
                      aria-invalid={Boolean(errors.email || errors.contact)}
                      aria-describedby={
                        errors.email ? "jt-email-error" : errors.contact ? "contact-error" : undefined
                      }
                    />
                  </Field>

                  {errors.contact && (
                    <p id="contact-error" className="error-text" role="alert">
                      {errors.contact}
                    </p>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="mt-5">
                  <p className="text-sm text-muted">Pick the closest fit — you can refine it later.</p>

                  {servicesLoading ? (
                    <div className="mt-4 grid gap-2.5 sm:grid-cols-2" aria-hidden="true">
                      {Array.from({ length: 6 }, (_, index) => (
                        <Skeleton key={index} className="h-[4.4rem] rounded-2xl" />
                      ))}
                    </div>
                  ) : servicesState.error ? (
                    <div className="mt-4 rounded-2xl border border-danger/40 bg-danger-soft p-4">
                      <p className="text-sm text-danger">{servicesState.error.message}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={servicesState.reload}
                        iconLeft={<RefreshIcon size={14} />}
                      >
                        Reload services
                      </Button>
                    </div>
                  ) : (
                    <div
                      role="radiogroup"
                      aria-label="Service you need"
                      aria-describedby={errors.service ? "service-error" : undefined}
                      className="mt-4 grid gap-2.5 sm:grid-cols-2"
                    >
                      {services.map((service) => {
                        const selected = form.service === service.title;
                        return (
                          <button
                            key={service._id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setField("service", service.title)}
                            className={`rounded-2xl border p-3.5 text-left transition-all duration-200 ${
                              selected
                                ? "border-accent bg-accent-soft shadow-[var(--shadow-subtle)]"
                                : "border-line bg-surface-elevated hover:-translate-y-0.5 hover:border-accent/50"
                            }`}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-foreground">{service.title}</span>
                              <span
                                className={`flex size-5 items-center justify-center rounded-full transition-colors ${
                                  selected ? "bg-accent text-accent-contrast" : "bg-surface text-transparent"
                                }`}
                                aria-hidden="true"
                              >
                                <CheckIcon size={12} />
                              </span>
                            </span>
                            <span className="mt-1 line-clamp-2 block text-xs text-muted">
                              {service.description}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {errors.service && (
                    <p id="service-error" className="error-text" role="alert">
                      {errors.service}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Honeypot — invisible to people, tempting to bots */}
            <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
              <label htmlFor="jt-website">Website</label>
              <input
                id="jt-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(event) => setField("website", event.target.value)}
              />
            </div>

            {submitError && (
              <p role="alert" className="mt-5 rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
                {submitError}
              </p>
            )}

            {/* Navigation */}
            <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-5">
              {step > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => goToStep(step - 1)} disabled={submitting}>
                  Back
                </Button>
              ) : (
                <span className="text-xs text-muted">Takes about a minute</span>
              )}

              {step < LAST_STEP ? (
                <Button size="sm" onClick={handleNext} iconRight={<ArrowRightIcon size={15} />}>
                  Continue
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="sm"
                  loading={submitting}
                  disabled={servicesLoading || services.length === 0}
                  iconRight={<ArrowRightIcon size={15} />}
                >
                  {submitting ? "Sending…" : "Send request"}
                </Button>
              )}
            </div>
          </form>
        </Reveal>

        <SuccessModal
          open={result !== null}
          referenceId={result?.referenceId ?? ""}
          onClose={closeSuccess}
        />
      </div>
    </section>
  );
}

export default StartProjectForm;
