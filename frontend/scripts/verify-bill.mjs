#!/usr/bin/env node
/**
 * verify:bill — pure-function checks for the invoice builder (`npm run verify:bill`).
 *
 * Runs in Node with NO browser and NO database: it imports the TypeScript
 * modules directly (`node --experimental-strip-types`) and asserts the
 * contract the owner's bill depends on.
 *
 *   1. the SVG is well-formed XML, self-contained, and square (0 0 2000 2000)
 *   2. it contains the invoice number, the client, every line item and the
 *      correct formatted totals/balance
 *   3. it contains NONE of the internal settlement vocabulary or amounts
 *      (Company / Treasury / Khazana / referrer / worker / split amounts)
 *   4. user text is XML-escaped
 *   5. 14 items, very long names and an Urdu client name still parse
 *   6. the money formatter/parser round-trips and rejects bad input
 *
 * Exit code 0 = all checks passed.
 */
import { buildBillSvg, BILL_PALETTE } from "../lib/bill/billSvg.ts";
import { formatMinor, parseMinor, minorToInput } from "../lib/bill/money.ts";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(`${name} ${detail}`);
    console.log(`  ✗ ${name} ${detail}`);
  }
}

/* ------------------------------------------------------------------ XML */

const ENTITY = /&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g;

/**
 * Minimal but strict XML well-formedness check: balanced tags, quoted
 * attributes, no raw `<` in text, no bare `&`. Throws with a reason.
 */
function assertWellFormedXml(svg) {
  if (!svg.startsWith("<svg")) throw new Error("does not start with <svg");
  if (!svg.endsWith("</svg>")) throw new Error("does not end with </svg>");

  const stack = [];
  const tagRe = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[^>]*>/g;
  let lastIndex = 0;
  let match;

  while ((match = tagRe.exec(svg)) !== null) {
    // Text between tags must be escaped.
    const between = svg.slice(lastIndex, match.index);
    lastIndex = tagRe.lastIndex;
    if (between.includes("<")) throw new Error("raw '<' in text content");
    const bareAmp = between.replace(ENTITY, "");
    if (bareAmp.includes("&")) throw new Error("unescaped '&' in text content");

    const tag = match[0];
    if (tag.startsWith("<!--") || tag.startsWith("<?") || tag.startsWith("<![CDATA[")) continue;

    if (tag.startsWith("</")) {
      const name = tag.slice(2, -1).trim();
      const open = stack.pop();
      if (open !== name) throw new Error(`closing </${name}> does not match <${open ?? "nothing"}>`);
      continue;
    }

    const selfClosing = tag.endsWith("/>");
    const inner = tag.slice(1, selfClosing ? -2 : -1).trim();
    const nameMatch = /^([A-Za-z_][\w.:-]*)/.exec(inner);
    if (!nameMatch) throw new Error(`tag without a name: ${tag.slice(0, 40)}`);
    const name = nameMatch[1];
    const attrs = inner.slice(name.length);
    // Every attribute must be `name="value"` or `name='value'` (both are valid
    // XML; the builder uses single quotes where the value itself has quotes).
    const attrRe = /\s*([\w.:-]+)="([^"]*)"|\s*([\w.:-]+)='([^']*)'/g;
    let consumed = attrs;
    let attrMatch;
    while ((attrMatch = attrRe.exec(attrs)) !== null) consumed = consumed.replace(attrMatch[0], "");
    if (consumed.trim().length > 0) throw new Error(`malformed attribute list near <${name} ${consumed.trim().slice(0, 40)}…>`);

    if (!selfClosing) stack.push(name);
  }

  if (stack.length > 0) throw new Error(`unclosed tag(s): ${stack.join(", ")}`);
  return true;
}

const textOf = (svg) => svg.replace(/<[^>]*>/g, " ");

/* ------------------------------------------------------------- fixtures */

const baseBusiness = {
  businessName: "Jazari Tech",
  address: "12 Knowledge Avenue, Karachi",
  phone: "+92 300 0000000",
  email: "hello@jazaritech.com",
  website: "jazaritech.com",
  paymentInstructions: "Bank: Meezan Bank\nIBAN: PK00 MEZN 0000 0000 0000 0000",
  billFooterNote: "Thank you for choosing Jazari Tech.",
};

const bill = {
  invoiceNumber: "JZ-2026-0007",
  issuedAt: "2026-10-12T09:30:00.000Z",
  deliveryDate: "2026-10-20T00:00:00.000Z",
  status: "partial",
  business: baseBusiness,
  client: {
    name: "Aurora Textiles (Pvt) Ltd",
    company: "Aurora Group",
    phone: "+92 321 1234567",
    email: "accounts@aurora.example",
    address: "Site II, Karachi",
  },
  items: [
    { name: "Video Ad Making", unitLabel: "video", quantity: 2, unitPriceMinor: 100000, lineTotalMinor: 200000 },
    { name: "Graphic Designing", unitLabel: "design", quantity: 3, unitPriceMinor: 50000, lineTotalMinor: 150000 },
  ],
  subtotalMinor: 350000,
  discountMinor: 25000,
  totalMinor: 325000,
  paidMinor: 100000,
  balanceMinor: 225000,
  payments: [
    { amountMinor: 60000, method: "Cash", receivedAt: "2026-10-12T10:00:00.000Z", reference: "CASH-1" },
    { amountMinor: 40000, method: "Bank Transfer", receivedAt: "2026-10-14T16:20:00.000Z", reference: "TRF-9981" },
  ],
};

console.log("\n[verify:bill] 1. well-formed, self-contained, square");
{
  const svg = buildBillSvg(bill);
  let parsed = null;
  try {
    assertWellFormedXml(svg);
    parsed = true;
  } catch (error) {
    parsed = error.message;
  }
  check("billSvg output is well-formed XML", parsed === true, String(parsed));
  check('viewBox is the square "0 0 2000 2000"', /viewBox="0 0 2000 2000"/.test(svg));
  const width = /<svg[^>]*width="(\d+)"/.exec(svg)?.[1];
  const height = /<svg[^>]*height="(\d+)"/.exec(svg)?.[1];
  check("width and height are equal (1:1)", width === height && width === "2000", `${width}×${height}`);
  check("no external references (fonts/images/links)", !/xlink:href|href="http|@import|<image/i.test(svg));
  check("palette carries the brand tokens", svg.includes(BILL_PALETTE.navy) && svg.includes(BILL_PALETTE.blue));
  check("the real traced logo artwork is embedded", svg.includes("M 2799 838"), "expected the traced 'top' piece path");
}

console.log("\n[verify:bill] 2. client-facing content");
{
  const svg = buildBillSvg(bill);
  const visible = textOf(svg);
  check("invoice number present", svg.includes("JZ-2026-0007"));
  check("client name present", visible.includes("Aurora Textiles (Pvt) Ltd"));
  check("client company present", visible.includes("Aurora Group"));
  check("every line item name present", bill.items.every((item) => visible.includes(item.name)));
  check("formatted subtotal 3,500.00", visible.includes("3500.00".replace("3500", "3,500")));
  check("discount line shows only when > 0", visible.includes("250.00"));
  check("TOTAL emphasised with 3,250.00", visible.includes("3,250.00"));
  check("PAID 1,000.00", visible.includes("1,000.00"));
  check("BALANCE DUE 2,250.00", visible.includes("2,250.00"));
  check("payments list shows the latest entries", visible.includes("TRF-9981") && visible.includes("CASH-1"));
  check("payment instructions are printed", visible.includes("PK00 MEZN 0000 0000 0000 0000"));
  check("footer note is printed", visible.includes("Thank you for choosing Jazari Tech."));
  check("status stamp reads PARTIAL", visible.includes("PARTIAL"));

  const noDiscount = buildBillSvg({ ...bill, discountMinor: 0, subtotalMinor: 350000, totalMinor: 350000 });
  check("discount row disappears when the discount is zero", !textOf(noDiscount).includes("Discount"));
}

console.log("\n[verify:bill] 3. the internal split NEVER reaches the bill");
{
  const svg = buildBillSvg(bill);
  const lower = svg.toLowerCase();
  const banned = ["company", "treasury", "khazana", "referrer", "worker", "split", "payout"];
  const leaks = banned.filter((word) => lower.includes(word));
  check("no settlement vocabulary in the SVG", leaks.length === 0, JSON.stringify(leaks));
  // The 30% company share (975.00) and the 10% referrer share (325.00) must not
  // appear anywhere, because no split is ever computed here.
  check("no split amounts in the SVG", !svg.includes("975.00") && !svg.includes("325.00"));
}

console.log("\n[verify:bill] 4. user text is escaped");
{
  const hostile = {
    ...bill,
    client: { name: `A & B <"C"> 'D'`, company: `X <script>alert(1)</script>`, phone: "", email: "", address: "" },
    items: [{ name: "Weird & <wonderful> \"thing\"", unitLabel: "item", quantity: 1, unitPriceMinor: 100, lineTotalMinor: 100 }],
    payments: [],
    subtotalMinor: 100,
    discountMinor: 0,
    totalMinor: 100,
    paidMinor: 0,
    balanceMinor: 100,
  };
  const svg = buildBillSvg(hostile);
  let reason = null;
  try {
    assertWellFormedXml(svg);
  } catch (error) {
    reason = error.message;
  }
  check("hostile text still produces well-formed XML", reason === null, String(reason));
  check("< & \" are escaped in the output", svg.includes("&lt;") && svg.includes("&amp;") && svg.includes("&quot;"));
  check("no raw <script> element can survive", !svg.includes("<script"));
}

console.log("\n[verify:bill] 5. stress: 14 items, long names, Urdu client name");
{
  const items = Array.from({ length: 14 }, (_, index) => ({
    name: `Item ${index + 1} — ${"Extremely long description that keeps going and going ".repeat(4)}`,
    unitLabel: "item",
    quantity: index + 1,
    unitPriceMinor: 12345,
    lineTotalMinor: 12345 * (index + 1),
  }));
  const subtotal = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const urdu = {
    ...bill,
    invoiceNumber: "JZ-2026-0014",
    client: { name: "محمد احمد ٹیکنالوجیز", company: "", phone: "", email: "", address: "" },
    items,
    subtotalMinor: subtotal,
    discountMinor: 0,
    totalMinor: subtotal,
    paidMinor: 0,
    balanceMinor: subtotal,
    payments: [],
    status: "unpaid",
  };
  const svg = buildBillSvg(urdu);
  let reason = null;
  try {
    assertWellFormedXml(svg);
  } catch (error) {
    reason = error.message;
  }
  check("14 items + long names + Urdu name → well-formed XML", reason === null, String(reason));
  check("the Urdu client name is in the SVG", svg.includes("محمد احمد ٹیکنالوجیز"));
  check("the Urdu text node carries RTL direction", /direction="rtl" unicode-bidi="plaintext"[^>]*>محمد/.test(svg));
  check("all 14 rows rendered", (svg.match(/Item \d+ —/g) || []).length === 14, String((svg.match(/Item \d+ —/g) || []).length));
  check("long descriptions are truncated with an ellipsis", svg.includes("…"));
  check("the frame is still square", /viewBox="0 0 2000 2000"/.test(svg));
}

console.log("\n[verify:bill] 6. money: parse/format round-trip");
{
  const cases = [0, 1, 99, 100, 12345678];
  let roundTrip = true;
  for (const minor of cases) {
    const formatted = formatMinor(minor);
    const parsed = parseMinor(minorToInput(minor));
    if (parsed !== minor) roundTrip = false;
    if (!/^Rs [\d,]+\.\d{2}$/.test(formatted)) roundTrip = false;
  }
  check("format/parse round-trips 0, 1, 99, 100, 12345678 paisa", roundTrip);
  check("formatMinor(12345678) === 'Rs 123,456.78'", formatMinor(12345678) === "Rs 123,456.78", formatMinor(12345678));
  check("formatMinor(1) === 'Rs 0.01'", formatMinor(1) === "Rs 0.01", formatMinor(1));
  check('parseMinor("abc") === null', parseMinor("abc") === null);
  check('parseMinor("-5") === null (no negative money)', parseMinor("-5") === null);
  check('parseMinor("1.234") === null (three decimals cannot be paisa)', parseMinor("1.234") === null);
  check('parseMinor("") === null', parseMinor("") === null);
  check('parseMinor("1,234.56") === 123456', parseMinor("1,234.56") === 123456, String(parseMinor("1,234.56")));
  check('parseMinor("Rs 12.5") === 1250', parseMinor("Rs 12.5") === 1250, String(parseMinor("Rs 12.5")));
  check('minorToInput(0) === "0"', minorToInput(0) === "0");
}

console.log(`\n[verify:bill] ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const failure of failures) console.log(`  → ${failure}`);
  process.exit(1);
}
process.exit(0);
