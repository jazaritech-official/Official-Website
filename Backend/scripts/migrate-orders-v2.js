#!/usr/bin/env node
/**
 * migrate-orders-v2 — `npm run migrate:orders`
 *
 * Backfills the OPTIONAL fields the new Work Types + three-owner split feature
 * added. Deliberately conservative:
 *
 *   · IDEMPOTENT      — running it twice changes nothing the second time;
 *   · NON-DESTRUCTIVE — it never deletes, never rewrites money and NEVER
 *     touches the stored `split` of an existing order: old orders keep their
 *     totals, their referrer/worker/company split and their treasury figures
 *     exactly as they were (asserted by the smoke suite, which runs this
 *     script against a database holding legacy orders);
 *   · the new `splitSnapshot` is only ever written by the API when an order is
 *     created/edited/recalculated — the migration does not invent one.
 *
 * What it backfills:
 *   1. Order.items[].workTypeId = null, customPrice = false  (missing fields)
 *   2. Payee.isOwner = false                                (missing field)
 *   3. FinanceSettings.splitTemplate = { entries: [], companyReserveBp: 0,
 *      roundTo100: false }                                  (missing path)
 *
 * Connection: MONGODB_URI (or the Backend/.env default).
 */
import mongoose from "mongoose";
import env from "../config/env.js";
import Order from "../models/Order.js";
import Payee from "../models/Payee.js";
import FinanceSettings from "../models/FinanceSettings.js";

const uri = process.env.MONGODB_URI || env.mongoUri;

async function run() {
  await mongoose.connect(uri);
  const report = {};

  // 1. Order line items: uniform workTypeId/customPrice, values untouched.
  const ordersTouched = await Order.updateMany(
    { items: { $elemMatch: { workTypeId: { $exists: false } } } },
    { $set: { "items.$[].workTypeId": null, "items.$[].customPrice": false } },
  );
  report.orderItemsBackfilled = ordersTouched.modifiedCount ?? 0;

  // 2. Owner flags default to false for people created before the feature.
  const payeesTouched = await Payee.updateMany(
    { isOwner: { $exists: false } },
    { $set: { isOwner: false } },
  );
  report.payeesBackfilled = payeesTouched.modifiedCount ?? 0;

  // 3. The split template starts EMPTY: with no template configured, every
  //    order keeps the legacy behaviour — that is what makes this safe to run
  //    on production before the owner has set anything up.
  const settingsTouched = await FinanceSettings.updateOne(
    { key: "default", splitTemplate: { $exists: false } },
    { $set: { splitTemplate: { entries: [], companyReserveBp: 0, roundTo100: false } } },
  );
  report.settingsBackfilled = settingsTouched.modifiedCount ?? 0;

  const changed = Object.values(report).some((value) => value > 0);
  console.log(`[migrate:orders] ${JSON.stringify(report)}`);
  console.log(
    changed
      ? "[migrate:orders] done — safe to re-run (a second run reports zeros)."
      : "[migrate:orders] nothing to do — database already migrated.",
  );

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error(`[migrate:orders] failed: ${error.stack || error.message}`);
  process.exit(1);
});
