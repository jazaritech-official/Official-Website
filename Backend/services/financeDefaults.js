import FinanceSettings, { DEFAULT_PAYMENT_METHODS } from "../models/FinanceSettings.js";
import CatalogItem from "../models/CatalogItem.js";

/**
 * ensureFinanceDefaults() — lazy, idempotent bootstrap of the finance data.
 *
 * Called from the settings / catalogue GET handlers so a production database
 * is usable the FIRST time an admin opens the Orders pages, without anybody
 * re-running a seed (and seed:prod is never touched). Running it on every
 * request is harmless: every write is an `upsert` guarded by `$setOnInsert`,
 * so existing values — including prices the admin has already typed in — are
 * never overwritten.
 *
 * The default catalogue prices are deliberately 0: the owner must type the
 * real price for each service, so the admin is never handed a made-up number.
 */
export const DEFAULT_CATALOG_ITEMS = [
  { name: "Video Ad Making", unitLabel: "video", sortOrder: 10 },
  { name: "Graphic Designing", unitLabel: "design", sortOrder: 20 },
  { name: "Logo Design", unitLabel: "design", sortOrder: 30 },
  { name: "Social Media Post Pack", unitLabel: "pack", sortOrder: 40 },
  { name: "Website Development", unitLabel: "project", sortOrder: 50 },
  { name: "Mobile App Development", unitLabel: "project", sortOrder: 60 },
  { name: "UI/UX Design", unitLabel: "screen", sortOrder: 70 },
  { name: "SEO & Marketing", unitLabel: "month", sortOrder: 80 },
  { name: "Custom Work", unitLabel: "item", sortOrder: 90 },
];

export const FINANCE_DEFAULTS_KEY = "default";

let inflight = null;

/** Returns the FinanceSettings singleton, creating it and the catalogue once. */
export async function ensureFinanceDefaults() {
  if (inflight) return inflight;

  inflight = (async () => {
    const settings = await FinanceSettings.findOneAndUpdate(
      { key: FINANCE_DEFAULTS_KEY },
      {
        $setOnInsert: {
          key: FINANCE_DEFAULTS_KEY,
          referrerBp: 1000,
          workerBp: 2000,
          currency: "PKR",
          paymentMethods: [...DEFAULT_PAYMENT_METHODS],
          business: {
            businessName: "Jazari Tech",
            address: "",
            phone: "",
            email: "",
            website: "",
            paymentInstructions: "",
            billFooterNote: "Thank you for choosing Jazari Tech.",
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, rawResult: false },
    ).lean();

    let catalogUpserted = 0;
    for (const item of DEFAULT_CATALOG_ITEMS) {
      const nameKey = item.name.trim().toLowerCase();
      const result = await CatalogItem.updateOne(
        { nameKey },
        {
          $setOnInsert: {
            name: item.name,
            nameKey,
            unitLabel: item.unitLabel,
            defaultUnitPriceMinor: 0,
            isActive: true,
            sortOrder: item.sortOrder,
          },
        },
        { upsert: true },
      );
      if (result.upsertedCount) catalogUpserted += 1;
    }

    return { settings, catalogUpserted };
  })().catch((error) => {
    // A transient failure must not be cached — the next request retries.
    inflight = null;
    throw error;
  });

  return inflight;
}

export default ensureFinanceDefaults;
