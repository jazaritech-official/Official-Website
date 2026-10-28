"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatMinor } from "@/lib/bill/money";
import { bpToInput, percentToBp } from "@/lib/finance";
import { ChartIcon, RefreshIcon } from "@/components/icons";
import type { FinanceSettings, TreasuryMonth, TreasuryReport } from "@/types/api";

/** The last 12 Karachi months, newest last — gaps included so the chart is honest. */
function lastTwelveMonths(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let index = 11; index >= 0; index -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    out.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/**
 * Hand-drawn bar chart (no chart library): 12 months of the company box, drawn
 * as inline SVG, with a real <table> fallback for screen readers.
 */
function TreasuryChart({ months }: { months: TreasuryMonth[] }) {
  const keys = lastTwelveMonths();
  const byMonth = new Map(months.map((entry) => [entry.month, entry.collectedMinor]));
  const values = keys.map((key) => byMonth.get(key) ?? 0);
  const max = Math.max(1, ...values);

  const width = 960;
  const height = 300;
  const pad = 44;
  const barArea = width - pad * 2;
  const barWidth = barArea / keys.length - 12;
  const baseline = height - pad;

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Company box collected per month, last 12 months"
        data-testid="treasury-chart"
      >
        <line x1={pad} y1={baseline} x2={width - pad} y2={baseline} stroke="var(--border-strong)" strokeWidth="1" />
        {keys.map((key, index) => {
          const value = values[index];
          const barHeight = Math.round((value / max) * (baseline - pad - 12));
          const x = pad + index * (barArea / keys.length) + 6;
          const isCurrent = index === keys.length - 1;
          return (
            <g key={key}>
              <rect
                x={x}
                y={baseline - barHeight}
                width={barWidth}
                height={Math.max(value > 0 ? 2 : 0, barHeight)}
                fill={isCurrent ? "var(--accent)" : "var(--primary)"}
                opacity={isCurrent ? 1 : 0.72}
                rx={3}
              >
                <title>{`${key}: ${formatMinor(value)}`}</title>
              </rect>
              <text x={x + barWidth / 2} y={baseline + 20} textAnchor="middle" fontSize="13" fill="var(--muted)">
                {key.slice(2)}
              </text>
            </g>
          );
        })}
      </svg>
      <details>
        <summary className="cursor-pointer text-sm text-muted">Monthly figures as a table</summary>
        <table className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">Company box collected per month</caption>
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
              <th scope="col" className="py-2 font-semibold">Month</th>
              <th scope="col" className="py-2 text-right font-semibold">Collected</th>
              <th scope="col" className="py-2 text-right font-semibold">Payments</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const entry = months.find((month) => month.month === key);
              return (
                <tr key={key} className="table-row">
                  <td className="py-1.5">{key}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMinor(entry?.collectedMinor ?? 0)}</td>
                  <td className="py-1.5 text-right tabular-nums">{entry?.payments ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </div>
  );
}

interface BusinessDraft {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  paymentInstructions: string;
  billFooterNote: string;
}

interface SettingsDraft {
  referrerInput: string;
  workerInput: string;
  methods: string[];
  business: BusinessDraft;
}

/**
 * The settings form is its own component with its OWN key (the JSON of the
 * settings it was loaded from). When the API returns new settings the panel is
 * remounted and its state is rebuilt from the server, which keeps the draft
 * honest without any setState-inside-effect.
 */
function SettingsPanel({ settings, onSaved }: { settings: FinanceSettings; onSaved: () => void }) {
  const [draft, setDraft] = useState<SettingsDraft>(() => ({
    referrerInput: bpToInput(settings.referrerBp),
    workerInput: bpToInput(settings.workerBp),
    methods: [...settings.paymentMethods],
    business: { ...settings.business },
  }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patch = (changes: Partial<SettingsDraft>) => setDraft((current) => ({ ...current, ...changes }));

  const saveSettings = async () => {
    const referrerBp = percentToBp(draft.referrerInput);
    const workerBp = percentToBp(draft.workerInput);
    if (referrerBp === null || workerBp === null) {
      setError("Percentages must be numbers between 0 and 100 (up to two decimals).");
      return;
    }
    const cleanedMethods = draft.methods.map((method) => method.trim()).filter(Boolean);
    if (cleanedMethods.length === 0) {
      setError("Keep at least one payment method.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.admin.finance.settings.update({
        referrerBp,
        workerBp,
        paymentMethods: cleanedMethods,
        business: draft.business,
      });
      setMessage("Settings saved. New orders use these defaults; existing orders keep their own snapshot.");
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not save the settings.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="settings-referrer">Referrer share (%)</label>
          <input
            id="settings-referrer"
            data-testid="settings-referrer"
            className="field w-32 text-right tabular-nums"
            inputMode="decimal"
            value={draft.referrerInput}
            onChange={(event) => patch({ referrerInput: event.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="settings-worker">Worker share each (%)</label>
          <input
            id="settings-worker"
            data-testid="settings-worker"
            className="field w-32 text-right tabular-nums"
            inputMode="decimal"
            value={draft.workerInput}
            onChange={(event) => patch({ workerInput: event.target.value })}
          />
        </div>
      </div>

      <div>
        <span className="label">Payment methods</span>
        <ul className="space-y-2">
          {draft.methods.map((method, index) => (
            <li key={index} className="flex items-center gap-2">
              <input
                aria-label={`Payment method ${index + 1}`}
                className="field"
                value={method}
                onChange={(event) =>
                  patch({ methods: draft.methods.map((entry, i) => (i === index ? event.target.value : entry)) })
                }
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => patch({ methods: draft.methods.filter((_, i) => i !== index) })}
                disabled={draft.methods.length <= 1}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => patch({ methods: [...draft.methods, "New method"] })}
          disabled={draft.methods.length >= 20}
        >
          Add method
        </Button>
      </div>

      <fieldset className="space-y-3 rounded-xl border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">Business details printed on the bill</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="biz-name">Business name</label>
            <input
              id="biz-name"
              data-testid="biz-name"
              className="field"
              value={draft.business.businessName}
              onChange={(event) => patch({ business: { ...draft.business, businessName: event.target.value } })}
            />
          </div>
          <div>
            <label className="label" htmlFor="biz-phone">Phone</label>
            <input
              id="biz-phone"
              className="field"
              value={draft.business.phone}
              onChange={(event) => patch({ business: { ...draft.business, phone: event.target.value } })}
            />
          </div>
          <div>
            <label className="label" htmlFor="biz-email">Email</label>
            <input
              id="biz-email"
              className="field"
              value={draft.business.email}
              onChange={(event) => patch({ business: { ...draft.business, email: event.target.value } })}
            />
          </div>
          <div>
            <label className="label" htmlFor="biz-website">Website</label>
            <input
              id="biz-website"
              className="field"
              value={draft.business.website}
              onChange={(event) => patch({ business: { ...draft.business, website: event.target.value } })}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="biz-address">Address</label>
          <input
            id="biz-address"
            className="field"
            value={draft.business.address}
            onChange={(event) => patch({ business: { ...draft.business, address: event.target.value } })}
          />
        </div>
        <div>
          <label className="label" htmlFor="biz-instructions">
            Payment instructions (bank / IBAN / wallet lines — one per line)
          </label>
          <textarea
            id="biz-instructions"
            data-testid="biz-instructions"
            className="field min-h-24"
            value={draft.business.paymentInstructions}
            onChange={(event) => patch({ business: { ...draft.business, paymentInstructions: event.target.value } })}
          />
        </div>
        <div>
          <label className="label" htmlFor="biz-footer">Bill footer note</label>
          <input
            id="biz-footer"
            className="field"
            value={draft.business.billFooterNote}
            onChange={(event) => patch({ business: { ...draft.business, billFooterNote: event.target.value } })}
          />
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted" data-testid="settings-saved">
          {message}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() =>
            setDraft({
              referrerInput: bpToInput(settings.referrerBp),
              workerInput: bpToInput(settings.workerBp),
              methods: [...settings.paymentMethods],
              business: { ...settings.business },
            })
          }
          disabled={busy}
        >
          Reset
        </Button>
        <Button onClick={() => void saveSettings()} loading={busy} data-testid="save-settings">
          Save settings
        </Button>
      </div>
    </div>
  );
}

/** Treasury: what the box kept, what is owed, and the settings behind both. */
export function TreasuryManager() {
  const reportState = useApiData<TreasuryReport>((signal) => api.admin.finance.treasury.get(signal), "treasury");
  const settingsState = useApiData<FinanceSettings>(() => api.admin.finance.settings.get(), "treasury-settings");

  const report = reportState.data;
  const settings = settingsState.data;

  return (
    <div className="space-y-6" data-treasury-manager>
      {reportState.loading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : reportState.error ? (
        <EmptyState
          title="Treasury could not be loaded"
          description={reportState.error.message}
          icon={<ChartIcon size={22} />}
          action={
            <Button variant="outline" size="sm" onClick={reportState.reload}>
              Try again
            </Button>
          }
        />
      ) : report ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3" data-testid="treasury-cards">
            <div className="card px-4 py-4">
              <p className="text-xs uppercase tracking-wider text-muted">Company box collected</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground" data-testid="treasury-collected">
                {formatMinor(report.collectedCompanyMinor)}
              </p>
              <p className="mt-1 text-xs text-muted">
                The share of money actually received that belongs to the company.
              </p>
            </div>
            <div className="card px-4 py-4">
              <p className="text-xs uppercase tracking-wider text-muted">Still to collect</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground" data-testid="treasury-expected">
                {formatMinor(report.stillToCollectMinor)}
              </p>
              <p className="mt-1 text-xs text-muted">Of {formatMinor(report.expectedCompanyMinor)} expected in total.</p>
            </div>
            <div className="card px-4 py-4">
              <p className="text-xs uppercase tracking-wider text-muted">People owed</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground" data-testid="treasury-people-owed">
                {formatMinor(report.peopleOwedMinor)}
              </p>
              <p className="mt-1 text-xs text-muted">{formatMinor(report.peoplePaidOutMinor)} already paid out.</p>
            </div>
          </div>

          <section className="card p-5">
            <h2 className="text-base font-semibold text-foreground">Company box — last 12 months</h2>
            <p className="mt-1 text-sm text-muted">Grouped by the month each payment was received (Asia/Karachi).</p>
            <div className="mt-4">
              <TreasuryChart months={report.months} />
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-base font-semibold text-foreground">People</h2>
            <p className="mt-1 text-sm text-muted">
              Every share still owed, across all open orders. Mark a share paid from the order itself.
            </p>
            {report.people.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No shares have been assigned yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <caption className="sr-only">Shares owed per person</caption>
                  <thead>
                    <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                      <th scope="col" className="py-2 font-semibold">Name</th>
                      <th scope="col" className="py-2 text-right font-semibold">Orders</th>
                      <th scope="col" className="py-2 text-right font-semibold">Owed</th>
                      <th scope="col" className="py-2 text-right font-semibold">Paid out</th>
                      <th scope="col" className="py-2 text-right font-semibold">Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.people.map((person) => (
                      <tr key={`${person.payeeId ?? "x"}-${person.name}`} className="table-row">
                        <td className="py-2">{person.name}</td>
                        <td className="py-2 text-right tabular-nums">{person.orderCount}</td>
                        <td className="py-2 text-right tabular-nums">{formatMinor(person.owedMinor)}</td>
                        <td className="py-2 text-right tabular-nums">{formatMinor(person.paidOutMinor)}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">
                          {person.pendingMinor > 0 ? formatMinor(person.pendingMinor) : <Badge tone="success">Settled</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {/* ------------------------------------------------------- settings */}
      <section className="card p-5" data-testid="treasury-settings">
        <h2 className="text-base font-semibold text-foreground">Settings</h2>
        <p className="mt-1 text-sm text-muted">
          The defaults for every new order, and the details printed on the bill. Existing orders keep their own
          snapshot.
        </p>

        {settingsState.loading ? (
          <Skeleton className="mt-4 h-40 w-full rounded-xl" />
        ) : settings ? (
          <SettingsPanel
            key={JSON.stringify(settings)}
            settings={settings}
            onSaved={() => {
              settingsState.reload();
              reportState.reload();
            }}
          />
        ) : (
          <p className="mt-4 text-sm text-danger">{settingsState.error?.message ?? "Settings could not be loaded."}</p>
        )}
      </section>

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            reportState.reload();
            settingsState.reload();
          }}
          iconLeft={<RefreshIcon size={14} />}
        >
          Refresh figures
        </Button>
      </div>
    </div>
  );
}

export default TreasuryManager;
