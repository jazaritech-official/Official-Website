/**
 * BILL INVOICE — the on-screen, printable invoice.
 *
 * The SAME data as the exported SVG (see lib/bill/billSvg.ts), but as real
 * HTML: semantic <table> markup a screen reader can navigate, brand tokens for
 * colour (WCAG AA pairs are audited by scripts/audit-contrast.mjs), and an
 * A4-portrait print stylesheet (app/globals.css, `@media print`) so
 * "Print / Save as PDF" produces a proper document. Nothing here is
 * absolutely positioned: a CSS grid and tables only, so long names wrap and
 * nothing overlaps or clips.
 */
import { Logo } from "@/components/brand/Logo";
import { bpToPercent, formatDay } from "@/lib/finance";
import { formatMinor } from "@/lib/bill/money";
import type { BillData } from "@/lib/bill/billSvg";

const STATUS_LABEL: Record<BillData["status"], string> = {
  paid: "Paid",
  partial: "Partially paid",
  unpaid: "Unpaid",
};

export interface BillInvoiceProps {
  data: BillData;
}

export function BillInvoice({ data }: BillInvoiceProps) {
  const distribution = (data.distribution ?? []).filter((entry) => entry && entry.bp !== undefined);
  const business = data.business;

  return (
    <article className="invoice-sheet" data-testid="bill-preview" aria-label={`Invoice ${data.invoiceNumber}`}>
      {/* ------------------------------------------------------ header band */}
      <header className="invoice-header">
        <div className="flex min-w-0 items-center gap-3">
          <Logo variant="mark" sizes="72px" className="h-14 w-14 shrink-0" />
          <div className="min-w-0">
            <p className="invoice-brand">{business.businessName || "Jazari Tech"}</p>
            <p className="invoice-contact">
              {[business.address, business.phone, business.email, business.website].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="invoice-title">INVOICE</p>
          <p className="invoice-number">{data.invoiceNumber}</p>
          <p className="invoice-contact">Issued {formatDay(data.issuedAt)}</p>
          {data.deliveryDate ? <p className="invoice-contact">Delivery {formatDay(data.deliveryDate)}</p> : null}
          <p className="invoice-status">
            <span className={`invoice-dot invoice-dot--${data.status}`} aria-hidden="true" />
            {STATUS_LABEL[data.status]}
          </p>
        </div>
      </header>

      {/* ------------------------------------------- billed to + how to pay */}
      <div className="invoice-grid-2">
        <section>
          <h3 className="invoice-label">Billed to</h3>
          <p className="invoice-client">{data.client.name}</p>
          <p className="invoice-contact">
            {[data.client.company, data.client.phone, data.client.email, data.client.address]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </section>
        <section>
          <h3 className="invoice-label">Payments received</h3>
          {data.payments.length === 0 ? (
            <p className="invoice-contact">No payments recorded yet.</p>
          ) : (
            <ul className="invoice-payments">
              {data.payments
                .slice(-3)
                .reverse()
                .map((payment, index) => (
                  <li key={`${payment.receivedAt}-${index}`}>
                    <span>
                      {formatDay(payment.receivedAt)} · {payment.method}
                      {payment.reference ? ` · ${payment.reference}` : ""}
                    </span>
                    <span className="tabular-nums">{formatMinor(payment.amountMinor)}</span>
                  </li>
                ))}
            </ul>
          )}
          {business.paymentInstructions?.trim() ? (
            <>
              <h3 className="invoice-label invoice-label--spaced">How to pay</h3>
              <p className="invoice-contact whitespace-pre-line">{business.paymentInstructions.trim()}</p>
            </>
          ) : null}
        </section>
      </div>

      {/* ----------------------------------------------------- line items */}
      <table className="invoice-items">
        <caption className="sr-only">Line items on invoice {data.invoiceNumber}</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Description</th>
            <th scope="col" className="text-right">Qty</th>
            <th scope="col" className="text-right">Unit price</th>
            <th scope="col" className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, index) => (
            <tr key={`${item.name}-${index}`}>
              <td className="tabular-nums">{index + 1}</td>
              <td>{item.name}</td>
              <td className="text-right tabular-nums">{item.quantity}</td>
              <td className="text-right tabular-nums">{formatMinor(item.unitPriceMinor)}</td>
              <td className="text-right font-semibold tabular-nums">{formatMinor(item.lineTotalMinor)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ------------------------------------ distribution + totals block */}
      <div className="invoice-grid-2 invoice-grid-2--bottom">
        {distribution.length > 0 ? (
          <section>
            <h3 className="invoice-label">Distribution among owners</h3>
            <table className="invoice-distribution" data-testid="bill-distribution">
              <caption className="sr-only">How the invoice total is shared among the owners</caption>
              <thead>
                <tr>
                  <th scope="col">Owner</th>
                  <th scope="col" className="text-right">Share</th>
                  <th scope="col" className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {distribution.map((entry, index) => (
                  <tr key={`${entry.name}-${index}`}>
                    <td>
                      {entry.isReserve ? "Reserve" : entry.name}
                      {entry.role && !entry.isReserve ? <span className="invoice-muted"> · {entry.role}</span> : null}
                    </td>
                    <td className="text-right tabular-nums">{bpToPercent(entry.bp)}</td>
                    <td className="text-right font-semibold tabular-nums">{formatMinor(entry.amountMinor)}</td>
                  </tr>
                ))}
                <tr className="invoice-total-row">
                  <th scope="row">Total</th>
                  <td className="text-right tabular-nums">100%</td>
                  <td className="text-right font-semibold tabular-nums">
                    {formatMinor(distribution.reduce((sum, entry) => sum + entry.amountMinor, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="invoice-footnote" data-testid="bill-rounding-note">
              Rounded to whole rupees; remainder assigned by largest fraction
              {data.roundTo100 ? " · shares rounded to the nearest Rs 100" : ""}.
            </p>
          </section>
        ) : null}

        <section className={distribution.length > 0 ? "invoice-totals" : "invoice-totals invoice-totals--wide"}>
          <dl>
            <div>
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatMinor(data.subtotalMinor)}</dd>
            </div>
            {data.discountMinor > 0 ? (
              <div>
                <dt>Discount</dt>
                <dd className="tabular-nums">− {formatMinor(data.discountMinor)}</dd>
              </div>
            ) : null}
            <div className="invoice-total-line">
              <dt>Total</dt>
              <dd className="tabular-nums" data-testid="bill-total">{formatMinor(data.totalMinor)}</dd>
            </div>
            <div>
              <dt>Paid</dt>
              <dd className="tabular-nums">{formatMinor(data.paidMinor)}</dd>
            </div>
            <div>
              <dt>Balance due</dt>
              <dd className="tabular-nums">{formatMinor(data.balanceMinor)}</dd>
            </div>
          </dl>
        </section>
      </div>

      {/* ---------------------------------------------------------- footer */}
      <footer className="invoice-footer">
        {data.notes?.trim() ? <p className="invoice-muted">{data.notes.trim()}</p> : <span />}
        <p className="invoice-thanks">
          {business.billFooterNote?.trim() || "Thank you for choosing Jazari Tech."}
        </p>
      </footer>
    </article>
  );
}

export default BillInvoice;
