"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { api, ApiError } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Spinner";
import { Reveal } from "@/components/motion/Reveal";
import { SectionIndex } from "@/components/layout/SectionIndex";
import { restingLine } from "@/lib/serviceCopy";
import { SuccessModal } from "./SuccessModal";
import {
  ArrowRightIcon,
  CheckIcon,
  HandshakeIcon,
  LightbulbIcon,
  RefreshIcon,
  ShieldIcon,
} from "@/components/icons";
import type { SubmissionResult, SubmissionTimeline } from "@/types/api";

/**
 * SECTION 6 — "Start Your Project".
 *
 * UX DECISION (Task L, documented in PROJECT_NOTES.md §40)
 * The old flow asked four questions as four full steps: name → work → contact →
 * service. "Your work" (a single optional field) did not deserve a screen of its
 * own, so it moved in with the name and the flow is now **three input steps plus
 * a Review step**:
 *
 *   1. About you         — name + company/domain
 *   2. How to reach you  — phone and/or email (the rule is stated up front)
 *   3. What you need     — service, timeline, project details
 *   4. Review            — every answer, with an "Edit" link per section
 *
 * Fewer near-empty screens, an explicit confirm before sending, and no question
 * is asked twice. Everything is progressive: the form still works with the
 * keyboard alone, keeps a draft in `sessionStorage` (never `localStorage`, never
 * after a successful submit) and never depends on JS for reading the fields.
 */

const STEPS = [
  { key: "about", label: "About you" },
  { key: "contact", label: "How to reach you" },
  { key: "need", label: "What you need" },
  { key: "review", label: "Review" },
] as const;

const REVIEW_INDEX = STEPS.length - 1;

const TIMELINES: Array<{ value: SubmissionTimeline; label: string }> = [
  { value: "asap", label: "As soon as possible" },
  { value: "1-3-months", label: "Within 1–3 months" },
  { value: "3-6-months", label: "In 3–6 months" },
  { value: "exploring", label: "Just exploring" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9][0-9\s\-().]{6,19}$/;
const MESSAGE_MAX = 1000;
const DRAFT_KEY = "jazari:project-draft:v1";

interface FormState {
  name: string;
  domain: string;
  phone: string;
  email: string;
  service: string;
  timeline: SubmissionTimeline | "";
  message: string;
  /** Honeypot field — must stay empty for humans. */
  website: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  domain: "",
  phone: "",
  email: "",
  service: "",
  timeline: "",
  message: "",
  website: "",
};

/** Which step owns each field (also drives the error-summary anchors). */
const FIELD_STEP: Record<string, number> = {
  name: 0,
  domain: 0,
  phone: 1,
  email: 1,
  contact: 1,
  service: 2,
  timeline: 2,
  message: 2,
};

const FIELD_LABEL: Record<string, string> = {
  name: "Full name",
  domain: "Company or domain",
  phone: "Phone",
  email: "Email",
  contact: "Contact details",
  service: "Service",
  timeline: "Timeline",
  message: "Project details",
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

/** Strip protocol / www / trailing slashes so `example.com` and a full URL read the same. */
function normaliseDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
}

function validateStep(index: number, form: FormState): Record<string, string> {
  const found: Record<string, string> = {};

  if (index === 0) {
    if (form.name.trim().length < 2) {
      found.name = "Please tell us your name (at least 2 characters).";
    }
    if (normaliseDomain(form.domain).length > 200) {
      found.domain = "Please keep this under 200 characters.";
    }
  }

  if (index === 1) {
    const email = form.email.trim();
    const phone = form.phone.trim();
    if (!email && !phone) {
      found.contact = "Add a phone number or an email address — either one is enough.";
    } else {
      if (email && !EMAIL_RE.test(email)) {
        found.email = "That email address looks incomplete — please check it for a typo.";
      }
      if (phone && !PHONE_RE.test(phone)) {
        found.phone = "Use an international format, e.g. +880 1712 345678.";
      }
    }
  }

  if (index === 2) {
    if (!form.service) {
      found.service = "Pick the closest service — you can refine it with us later.";
    }
    if (form.message.trim().length > MESSAGE_MAX) {
      found.message = `Please keep this under ${MESSAGE_MAX} characters.`;
    }
  }

  return found;
}

/** Friendly, distinct copy for each backend failure mode. */
function describeSubmitFailure(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.status === 429) {
      return "You've sent several requests already. Please wait a minute and try again — your answers are still here.";
    }
    if (cause.status >= 500) {
      return "Our server had a problem saving your request. Nothing was lost — please try again.";
    }
    if (cause.status === 0) {
      return "We couldn't reach the server. Check your connection and try again — your answers are still here.";
    }
    return cause.message;
  }
  return "We couldn't reach the server. Check your connection and try again — your answers are still here.";
}

function Field({
  id,
  label,
  hint,
  error,
  counter,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  counter?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="form-field__head">
        <label htmlFor={id} className="label">
          {label}
        </label>
        {counter ? (
          <span className="form-counter" aria-hidden="true">
            {counter}
          </span>
        ) : null}
      </div>
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

export function StartProjectForm() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSummary, setShowSummary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [submittedService, setSubmittedService] = useState("");
  const [chipFocus, setChipFocus] = useState(0);

  const submittingRef = useRef(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<string | null>(null);
  const draftLoadedRef = useRef(false);
  const reduced = useReducedMotion();

  const servicesState = useApiData(() => api.services(), "form-services");
  const services = useMemo(() => servicesState.data ?? [], [servicesState.data]);

  /*
   * Draft restore. `sessionStorage` does not exist on the server, so reading it
   * in a lazy `useState` initialiser would desynchronise hydration (the server
   * would render empty fields and the client would render the draft). Reading it
   * after mount is the only hydration-safe option, which means one deliberate
   * post-mount state update — the documented exception to this lint rule.
   * The first write-back is skipped by `draftLoadedRef` so an empty form can
   * never overwrite a stored draft before it has been read.
   */
  useEffect(() => {
    if (draftLoadedRef.current) return;
    draftLoadedRef.current = true;
    try {
      const raw = window.sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<FormState>;
      if (!parsed || typeof parsed !== "object") return;
      const restored = Object.fromEntries(
        Object.entries(parsed).filter(([key]) => key in EMPTY_FORM && key !== "website"),
      ) as Partial<FormState>;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe draft restore (see note above)
      setForm((current) => ({ ...current, ...restored }));
    } catch {
      /* storage disabled or corrupted — the form simply starts empty */
    }
  }, []);

  useEffect(() => {
    if (!draftLoadedRef.current) return;
    try {
      const payload: Record<string, string> = { ...form };
      delete payload.website; // the honeypot is never persisted
      const hasContent = Object.values(payload).some((value) => value.trim().length > 0);
      if (hasContent) window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      else window.sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* best effort */
    }
  }, [form]);

  const clearDraft = useCallback(() => {
    try {
      window.sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  /* --- Focus management: new step heading, or the field a summary link targets */
  useEffect(() => {
    const field = pendingFocusRef.current;
    if (field) {
      pendingFocusRef.current = null;
      const node = document.getElementById(`jt-${field}`);
      node?.focus();
      node?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
      return;
    }
    if (step > 0 && step < REVIEW_INDEX) stepHeadingRef.current?.focus();
  }, [step, reduced]);

  const setField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field] && !(field === "phone" || field === "email" ? current.contact : undefined)) {
        return current;
      }
      const next = { ...current };
      delete next[field];
      delete next.contact;
      return next;
    });
  };

  const onFieldBlur = (field: keyof FormState, index: number) => {
    const found = validateStep(index, { ...form, [field]: String(form[field]) });
    const contactIssue = field === "phone" || field === "email" ? found.contact : undefined;
    const own = found[field] ?? contactIssue;
    setErrors((current) => {
      const next = { ...current };
      if (own) {
        if (contactIssue) next.contact = contactIssue;
        else next[field] = own;
      } else {
        delete next[field];
        delete next.contact;
      }
      return next;
    });
    if (!own) setShowSummary(false);
  };

  /*
   * Focus MUST land on the error summary, but `summaryRef.current` is still
   * null in the same tick that `setShowSummary(true)` is called — the element
   * only exists after the commit. Focus it in an effect instead (rule:
   * "error summary at the top, focus moved to it, role=alert").
   */
  useEffect(() => {
    if (showSummary) summaryRef.current?.focus();
  }, [showSummary]);

  const goToStep = (index: number) => {
    setErrors({});
    setShowSummary(false);
    setSubmitError(null);
    setStep(index);
  };

  const handleNext = () => {
    const found = validateStep(step, form);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setShowSummary(true);
      pendingFocusRef.current = Object.keys(found)[0];
      summaryRef.current?.focus();
      return;
    }
    goToStep(step + 1);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (step < REVIEW_INDEX) {
      handleNext();
      return;
    }

    const all: Record<string, string> = {};
    for (let index = 0; index < REVIEW_INDEX; index += 1) {
      Object.assign(all, validateStep(index, form));
    }
    if (Object.keys(all).length > 0) {
      setErrors(all);
      setShowSummary(true);
      const first = Object.keys(all)[0];
      setStep(FIELD_STEP[first] ?? 0);
      pendingFocusRef.current = first;
      summaryRef.current?.focus();
      return;
    }

    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setShowSummary(false);

    try {
      const submission = await api.submitProject({
        name: form.name.trim(),
        domain: normaliseDomain(form.domain),
        phone: form.phone.trim(),
        email: form.email.trim(),
        service: form.service,
        timeline: form.timeline,
        message: form.message.trim(),
        website: form.website,
      });
      setSubmittedService(form.service);
      setResult(submission);
      clearDraft();
    } catch (cause) {
      if (cause instanceof ApiError && cause.details && Object.keys(cause.details).length > 0) {
        setErrors(cause.details);
        setShowSummary(true);
        const first = Object.keys(cause.details)[0];
        setStep(FIELD_STEP[first] ?? 0);
        pendingFocusRef.current = first;
        summaryRef.current?.focus();
      } else {
        setSubmitError(describeSubmitFailure(cause));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const reset = useCallback(() => {
    setResult(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setSubmitError(null);
    setShowSummary(false);
    setStep(0);
    clearDraft();
  }, [clearDraft]);

  const goToField = (field: string) => {
    pendingFocusRef.current = field;
    setStep(FIELD_STEP[field] ?? 0);
  };

  const servicesLoading = servicesState.loading;
  const servicesEmpty = !servicesLoading && !servicesState.error && services.length === 0;
  const errorList = Object.keys(errors);

  return (
    <section id="start" aria-labelledby="start-heading" className="relative overflow-hidden py-16 sm:py-24">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-surface" />
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
              Three short steps and a review — no account, nothing to print. We reply with an honest
              scope, a timeline and the person who would lead the work.
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
          <form onSubmit={handleSubmit} noValidate className="card form-panel relative p-6 sm:p-8">
            <span aria-hidden="true" className="form-panel__tick form-panel__tick--tl" />
            <span aria-hidden="true" className="form-panel__tick form-panel__tick--tr" />
            <span aria-hidden="true" className="form-panel__tick form-panel__tick--bl" />
            <span aria-hidden="true" className="form-panel__tick form-panel__tick--br" />

            {/* Labelled progress rail */}
            <div className="form-rail__head">
              <span className="form-rail__count">
                Step {Math.min(step + 1, STEPS.length)} of {STEPS.length}
              </span>
              <span className="form-rail__label">{STEPS[step].label}</span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={STEPS.length}
              aria-valuenow={step + 1}
              aria-label="Project brief progress"
              className="form-rail"
            >
              <div
                className="form-rail__fill"
                style={{ transform: `scaleX(${(step + 1) / STEPS.length})` }}
              />
            </div>
            <ol className="form-rail__steps" aria-hidden="true">
              {STEPS.map((entry, index) => (
                <li key={entry.key} className={index <= step ? "is-done" : undefined}>
                  {entry.label}
                </li>
              ))}
            </ol>

            {/* Error summary — focused on failure, links jump to the field */}
            {showSummary && errorList.length > 0 ? (
              <div
                ref={summaryRef}
                tabIndex={-1}
                role="alert"
                data-form-error-summary
                className="form-summary"
              >
                <p className="form-summary__title">
                  {errorList.length === 1
                    ? "One thing needs your attention"
                    : `${errorList.length} things need your attention`}
                </p>
                <ul className="form-summary__list">
                  {errorList.map((field) => (
                    <li key={field}>
                      <button
                        type="button"
                        className="form-summary__link"
                        onClick={() => goToField(field)}
                      >
                        {FIELD_LABEL[field] ?? field}: {errors[field]}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Fields */}
            <div key={step} className="form-step min-h-[16.5rem]">
              <h3 ref={stepHeadingRef} tabIndex={-1} className="form-step__title outline-none">
                {step === 0 && "Who are we speaking with?"}
                {step === 1 && "How should we reach you?"}
                {step === 2 && "What do you need built?"}
                {step === 3 && "Does this look right?"}
              </h3>

              {step === 0 && (
                <div className="mt-5 space-y-5">
                  <Field
                    id="jt-name"
                    label="Full name"
                    hint="So we know who to ask for."
                    error={errors.name}
                  >
                    <input
                      id="jt-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      className="field"
                      placeholder="Amina Rahman"
                      maxLength={120}
                      value={form.name}
                      onChange={(event) => setField("name", event.target.value)}
                      onBlur={() => onFieldBlur("name", 0)}
                      aria-invalid={Boolean(errors.name)}
                      aria-describedby={errors.name ? "jt-name-error" : undefined}
                    />
                  </Field>

                  <Field
                    id="jt-domain"
                    label="Company or domain"
                    hint="Optional — a company name, a website (example.com) or what you do."
                    error={errors.domain}
                  >
                    <input
                      id="jt-domain"
                      name="domain"
                      type="text"
                      inputMode="url"
                      autoComplete="organization"
                      className="field"
                      placeholder="example.com"
                      maxLength={200}
                      value={form.domain}
                      onChange={(event) => setField("domain", event.target.value)}
                      onBlur={() => onFieldBlur("domain", 0)}
                      aria-invalid={Boolean(errors.domain)}
                      aria-describedby={errors.domain ? "jt-domain-error" : undefined}
                    />
                  </Field>
                </div>
              )}

              {step === 1 && (
                <div className="mt-5 space-y-5">
                  <p className="form-note">
                    Give us <strong>either</strong> a phone number <strong>or</strong> an email —
                    whichever you prefer. You do not need both.
                  </p>
                  <Field
                    id="jt-phone"
                    label="Phone"
                    error={errors.phone}
                    hint={errors.contact ? undefined : "Include the country code, e.g. +880 1712 345678."}
                  >
                    <input
                      id="jt-phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      className="field"
                      placeholder="+880 1712 345678"
                      value={form.phone}
                      onChange={(event) => setField("phone", event.target.value)}
                      onBlur={() => onFieldBlur("phone", 1)}
                      aria-invalid={Boolean(errors.phone || errors.contact)}
                      aria-describedby={
                        errors.phone ? "jt-phone-error" : errors.contact ? "contact-error" : undefined
                      }
                    />
                  </Field>

                  <Field id="jt-email" label="Email" error={errors.email}>
                    <input
                      id="jt-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      className="field"
                      placeholder="you@company.com"
                      value={form.email}
                      onChange={(event) => setField("email", event.target.value)}
                      onBlur={() => onFieldBlur("email", 1)}
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

              {step === 2 && (
                <div className="mt-5 space-y-5">
                  <p className="form-note">Pick the closest service — you can refine it later.</p>

                  {servicesLoading ? (
                    <div className="grid gap-2.5 sm:grid-cols-2" aria-hidden="true">
                      {Array.from({ length: 6 }, (_, index) => (
                        <Skeleton key={index} className="h-[4.6rem] rounded-2xl" />
                      ))}
                    </div>
                  ) : servicesState.error ? (
                    <div className="rounded-2xl border border-danger/40 bg-danger-soft p-4">
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
                  ) : servicesEmpty ? (
                    <div
                      data-form-services="empty"
                      className="rounded-2xl border border-line bg-surface-elevated p-4"
                    >
                      <p className="text-sm text-muted">
                        Our service list isn&apos;t available right now. You can still send this
                        brief — describe what you need below and we&apos;ll route it to the right team.
                      </p>
                    </div>
                  ) : (
                    <div
                      role="radiogroup"
                      aria-label="Service you need"
                      aria-describedby={errors.service ? "service-error" : undefined}
                      className="grid gap-2.5 sm:grid-cols-2"
                      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                        const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
                        if (!keys.includes(event.key)) return;
                        event.preventDefault();
                        const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
                        const next = (chipFocus + delta + services.length) % services.length;
                        setChipFocus(next);
                        setField("service", services[next].title);
                        document.getElementById(`jt-service-${next}`)?.focus();
                      }}
                    >
                      {services.map((service, index) => {
                        const selected = form.service === service.title;
                        return (
                          <button
                            key={service._id}
                            id={`jt-service-${index}`}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            tabIndex={index === chipFocus ? 0 : -1}
                            onClick={() => {
                              setChipFocus(index);
                              setField("service", service.title);
                            }}
                            className={`form-chip${selected ? " is-selected" : ""}`}
                          >
                            <span className="form-chip__top">
                              <span className="form-chip__title">{service.title}</span>
                              <span className="form-chip__check" aria-hidden="true">
                                {selected ? <CheckIcon size={12} /> : null}
                              </span>
                            </span>
                            <span className="form-chip__helper">{restingLine(service, 84)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <fieldset className="form-timeline">
                    <legend className="label">Timeline</legend>
                    <div className="form-timeline__options">
                      {TIMELINES.map((option) => (
                        <label
                          key={option.value}
                          className={`form-timeline__option${
                            form.timeline === option.value ? " is-selected" : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="timeline"
                            value={option.value}
                            checked={form.timeline === option.value}
                            onChange={() => setField("timeline", option.value)}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <Field
                    id="jt-message"
                    label="Tell us about your project"
                    hint="Optional — the problem, the goal, anything already built."
                    error={errors.message}
                    counter={`${form.message.length} / ${MESSAGE_MAX}`}
                  >
                    <textarea
                      id="jt-message"
                      name="message"
                      rows={4}
                      className="field form-textarea"
                      placeholder="We need a customer portal that connects to our existing ERP…"
                      maxLength={MESSAGE_MAX}
                      value={form.message}
                      onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                        setField("message", event.target.value)
                      }
                      onBlur={() => onFieldBlur("message", 2)}
                      aria-invalid={Boolean(errors.message)}
                      aria-describedby={errors.message ? "jt-message-error" : undefined}
                    />
                  </Field>

                  {errors.service && (
                    <p id="service-error" className="error-text" role="alert">
                      {errors.service}
                    </p>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="mt-5 space-y-4">
                  <p className="form-note">
                    Check everything below. Use the <strong>Edit</strong> links to change an answer —
                    nothing is sent until you press Send request.
                  </p>
                  <dl className="form-review" data-form-review>
                    {(
                      [
                        { step: 0, title: "About you", rows: [["Full name", form.name], ["Company or domain", normaliseDomain(form.domain)]] },
                        { step: 1, title: "How to reach you", rows: [["Phone", form.phone], ["Email", form.email]] },
                        {
                          step: 2,
                          title: "What you need",
                          rows: [
                            ["Service", form.service],
                            ["Timeline", TIMELINES.find((item) => item.value === form.timeline)?.label ?? ""],
                            ["Project details", form.message],
                          ],
                        },
                      ] as const
                    ).map((section) => (
                      <div key={section.title} className="form-review__section">
                        <dt className="form-review__head">
                          <span>{section.title}</span>
                          <button
                            type="button"
                            className="form-review__edit"
                            onClick={() => goToStep(section.step)}
                          >
                            Edit
                          </button>
                        </dt>
                        {section.rows.map(([label, value]) => (
                          <dd key={label} className="form-review__row">
                            <span className="form-review__label">{label}</span>
                            <span className={value ? "form-review__value" : "form-review__value is-empty"}>
                              {value || "Not provided"}
                            </span>
                          </dd>
                        ))}
                      </div>
                    ))}
                  </dl>
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
              <div role="alert" className="form-submit-error">
                <p>{submitError}</p>
                <Button variant="outline" size="sm" type="submit" disabled={submitting}>
                  Try again
                </Button>
              </div>
            )}

            <p className="form-privacy">
              We use these details only to contact you about your project. They are never sold or
              shared.
            </p>

            {/* Navigation */}
            <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-5">
              {step > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => goToStep(step - 1)} disabled={submitting}>
                  Back
                </Button>
              ) : (
                <span className="text-xs text-muted">Takes about a minute</span>
              )}

              {step < REVIEW_INDEX ? (
                <Button size="sm" onClick={handleNext} iconRight={<ArrowRightIcon size={15} />}>
                  Continue
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="sm"
                  loading={submitting}
                  disabled={submitting || servicesLoading}
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
          service={submittedService}
          onBackHome={() => {
            reset();
            window.location.hash = "#home";
          }}
          onSendAnother={reset}
          onClose={reset}
        />
      </div>
    </section>
  );
}

export default StartProjectForm;
