import Logo from "../models/Logo.js";
import {
  storeOriginal,
  storeProcessed,
  fetchStoredBytes,
  deleteImage,
  storageDriver,
} from "../services/storageService.js";
import { processLogoImage, DEFAULT_TOLERANCE } from "../services/imageProcessor.js";
import { sendData } from "../utils/apiResponse.js";
import { ApiError } from "../utils/errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/* --- Helpers -------------------------------------------------------------- */

/** Safe http/https-only URL validation (client validation is UX only). */
function normalizeWebsiteUrl(value) {
  if (value === undefined || value === null) return undefined;
  const raw = String(value).trim();
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw ApiError.badRequest("Enter a valid website URL.", { websiteUrl: "Invalid URL." });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw ApiError.badRequest("Only http and https website links are allowed.", {
      websiteUrl: "Only http/https links are allowed.",
    });
  }
  return parsed.toString();
}

function normalizeLogoInput(body = {}) {
  const updates = {};
  if (body.name !== undefined) updates.name = String(body.name).trim();
  if (body.displayName !== undefined) updates.displayName = String(body.displayName).trim();
  if (body.alt !== undefined) updates.alt = String(body.alt).trim();
  if (body.isVisible !== undefined) updates.isVisible = Boolean(body.isVisible);
  if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder) || 0;
  const websiteUrl = normalizeWebsiteUrl(body.websiteUrl);
  if (websiteUrl !== undefined) updates.websiteUrl = websiteUrl;
  return updates;
}

function readProcessingOptions(body = {}) {
  const options = {
    removeBackground: body.removeBackground === undefined ? true : Boolean(body.removeBackground),
    trim: body.trim === undefined ? true : Boolean(body.trim),
    tolerance: body.tolerance === undefined ? DEFAULT_TOLERANCE : Number(body.tolerance),
  };
  if (!Number.isFinite(options.tolerance)) options.tolerance = DEFAULT_TOLERANCE;
  options.tolerance = Math.min(100, Math.max(0, options.tolerance));
  return options;
}

/** Public-safe projection — never exposes publicIds or internal refs. */
function toPublicLogo(doc) {
  return {
    _id: doc._id,
    name: doc.name,
    displayName: doc.displayName || doc.name,
    secureUrl: doc.secureUrl,
    alt: doc.alt || doc.displayName || doc.name,
    websiteUrl: doc.websiteUrl || "",
    sortOrder: doc.sortOrder ?? 0,
    width: doc.width ?? null,
    height: doc.height ?? null,
    aspectRatio: doc.aspectRatio ?? null,
    hasAlpha: doc.hasAlpha ?? null,
    tone: doc.tone ?? "light",
    backgroundStatus: doc.backgroundStatus ?? "kept",
    dominantColors: Array.isArray(doc.dominantColors) ? doc.dominantColors : [],
  };
}

/** Run the pipeline and return the fields a Logo document would carry. */
function processedFields(processed) {
  if (!processed.buffer) {
    return {
      width: null,
      height: null,
      aspectRatio: null,
      hasAlpha: null,
      dominantColors: [],
      averageLuminance: null,
      tone: "light",
      backgroundStatus: "needs-transparent-png",
    };
  }
  const m = processed.metadata;
  return {
    width: m.width,
    height: m.height,
    aspectRatio: m.aspectRatio,
    hasAlpha: m.hasAlpha,
    dominantColors: m.dominantColors,
    averageLuminance: m.averageLuminance,
    tone: m.tone,
    backgroundStatus: processed.backgroundStatus,
  };
}

/** True when re-processing would produce the same result (no asset churn). */
function isEquivalent(logo, fields) {
  return (
    logo.width === fields.width &&
    logo.height === fields.height &&
    logo.hasAlpha === fields.hasAlpha &&
    logo.backgroundStatus === fields.backgroundStatus
  );
}

/**
 * Persist a processed result to storage and return the Logo fields to merge.
 * Falls back to storing the original bytes when the input could not be decoded.
 */
async function persistProcessed(originalBuffer, processed) {
  if (!processed.buffer) {
    const stored = await storeProcessed(originalBuffer);
    return { secureUrl: stored.secureUrl, publicId: stored.publicId, ...processedFields(processed) };
  }
  const stored = await storeProcessed(processed.buffer);
  return { secureUrl: stored.secureUrl, publicId: stored.publicId, ...processedFields(processed) };
}

/**
 * Process from an original buffer and store the result (used by upload/replace).
 * The original is never overwritten and never deleted here.
 */
async function buildProcessedFields(originalBuffer, options) {
  const processed = await processLogoImage(originalBuffer, options);
  const fields = await persistProcessed(originalBuffer, processed);
  return {
    fields,
    result: {
      status: processed.buffer ? processed.backgroundStatus : "needs-transparent-png",
      changed: processed.buffer ? processed.changed : false,
      reason: processed.reason,
    },
  };
}

/** Ensure a legacy logo has a preserved original; capture the current asset once. */
async function ensureOriginal(logo) {
  if (logo.originalPublicId && logo.originalUrl) return;
  const bytes = await fetchStoredBytes(logo.publicId);
  const stored = await storeProcessed(bytes); // reuse as a stable stored copy
  logo.originalUrl = stored.secureUrl;
  logo.originalPublicId = stored.publicId;
  await logo.save();
}

/** Delete both processed and original assets, never double-deleting shared ids. */
async function deleteLogoAssets(logo) {
  const ids = new Set([logo.publicId, logo.originalPublicId].filter(Boolean));
  const failures = [];
  for (const id of ids) {
    try {
      await deleteImage(id);
    } catch (error) {
      failures.push({ id, message: error.message });
    }
  }
  return failures;
}

/* --- Public --------------------------------------------------------------- */

/** GET /api/logos — visible logos for the public showcase. */
export const listPublicLogos = asyncHandler(async (_req, res) => {
  const logos = await Logo.find({ isVisible: true })
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();
  sendData(res, logos.map(toPublicLogo));
});

/* --- Admin ---------------------------------------------------------------- */

/** GET /api/admin/logos */
export const listAdminLogos = asyncHandler(async (_req, res) => {
  const logos = await Logo.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
  sendData(res, { logos, driver: storageDriver });
});

/** POST /api/admin/logos — preserve original, process, then persist metadata. */
export const createLogo = asyncHandler(async (req, res) => {
  const { name, displayName, alt, isVisible, sortOrder, websiteUrl } = normalizeLogoInput(req.body);
  const image = req.body?.image;

  if (!name) throw ApiError.badRequest("Logo name is required.", { name: "Logo name is required." });
  if (!image) throw ApiError.badRequest("Choose an image to upload.", { image: "Image is required." });

  const options = readProcessingOptions(req.body);
  const original = await storeOriginal(image);
  let processedFields;
  try {
    ({ fields: processedFields } = await buildProcessedFields(original.buffer, options));
  } catch (error) {
    await deleteImage(original.publicId).catch(() => {});
    throw error;
  }

  try {
    const logo = await Logo.create({
      name,
      displayName: displayName || "",
      alt: alt || displayName || name,
      websiteUrl: websiteUrl || "",
      isVisible: isVisible ?? true,
      sortOrder: sortOrder ?? 0,
      originalUrl: original.secureUrl,
      originalPublicId: original.publicId,
      ...processedFields,
    });
    return sendData(res, logo, 201);
  } catch (error) {
    // Roll back both uploaded assets so no orphan is left behind.
    await deleteImage(processedFields.publicId).catch(() => {});
    await deleteImage(original.publicId).catch(() => {});
    throw error;
  }
});

/** PUT /api/admin/logos/:id — metadata and/or image replacement (with processing). */
export const updateLogo = asyncHandler(async (req, res) => {
  const logo = await Logo.findById(req.params.id);
  if (!logo) throw ApiError.notFound("Logo not found.");

  const updates = normalizeLogoInput(req.body);
  const replacing = Boolean(req.body?.image);
  const options = readProcessingOptions(req.body);

  const previousProcessedId = logo.publicId;
  const previousOriginalId = logo.originalPublicId;
  let newOriginalId = null;
  let newProcessedId = null;

  if (replacing) {
    const original = await storeOriginal(req.body.image);
    newOriginalId = original.publicId;
    try {
      const { fields } = await buildProcessedFields(original.buffer, options);
      newProcessedId = fields.publicId;
      Object.assign(updates, fields, {
        originalUrl: original.secureUrl,
        originalPublicId: original.publicId,
      });
    } catch (error) {
      await deleteImage(original.publicId).catch(() => {});
      throw error;
    }
  }

  Object.assign(logo, updates);
  try {
    await logo.save();
  } catch (error) {
    // DB write failed → keep the previous (still-valid) assets, drop the new ones.
    if (newProcessedId) await deleteImage(newProcessedId).catch(() => {});
    if (newOriginalId) await deleteImage(newOriginalId).catch(() => {});
    throw error;
  }

  if (replacing) {
    // New asset is live; removing stale copies is best-effort and only a leak.
    for (const id of [previousProcessedId, previousOriginalId]) {
      if (!id || id === newProcessedId || id === newOriginalId) continue;
      await deleteImage(id).catch((error) => {
        console.warn(`[logos] could not remove previous asset ${id}: ${error.message}`);
      });
    }
  }

  return sendData(res, logo);
});

/** POST /api/admin/logos/:id/reprocess — always from the preserved original (idempotent). */
export const reprocessLogo = asyncHandler(async (req, res) => {
  const logo = await Logo.findById(req.params.id);
  if (!logo) throw ApiError.notFound("Logo not found.");

  await ensureOriginal(logo);

  const options = readProcessingOptions(req.body);
  const bytes = await fetchStoredBytes(logo.originalPublicId);
  const processed = await processLogoImage(bytes, options);
  const next = processedFields(processed);

  // Idempotent: if the pipeline would produce the same asset, keep the existing
  // processed file (no churn, no orphan) and just report the outcome.
  if (isEquivalent(logo, next)) {
    return sendData(res, {
      logo,
      result: { status: logo.backgroundStatus, changed: false, alreadyGood: true, reason: processed.reason },
    });
  }

  const previousProcessedId = logo.publicId;
  const fields = await persistProcessed(bytes, processed);
  Object.assign(logo, fields);
  await logo.save();

  if (previousProcessedId && previousProcessedId !== fields.publicId) {
    await deleteImage(previousProcessedId).catch((error) => {
      console.warn(`[logos] reprocess could not remove previous asset ${previousProcessedId}: ${error.message}`);
    });
  }

  sendData(res, {
    logo,
    result: {
      status: fields.backgroundStatus,
      changed: processed.buffer ? processed.changed : false,
      reason: processed.reason,
    },
  });
});

/** POST /api/admin/logos/:id/revert — restore the untouched original upload. */
export const revertLogo = asyncHandler(async (req, res) => {
  const logo = await Logo.findById(req.params.id);
  if (!logo) throw ApiError.notFound("Logo not found.");
  if (!logo.originalPublicId || !logo.originalUrl) {
    throw ApiError.badRequest("This logo has no preserved original to revert to.");
  }

  const previousProcessedId = logo.publicId;
  logo.secureUrl = logo.originalUrl;
  logo.publicId = logo.originalPublicId;
  logo.backgroundStatus = "kept";
  // The untouched original may not have alpha — never claim it does.
  logo.hasAlpha = null;
  await logo.save();

  if (previousProcessedId && previousProcessedId !== logo.publicId) {
    await deleteImage(previousProcessedId).catch((error) => {
      console.warn(`[logos] revert could not remove previous processed asset ${previousProcessedId}: ${error.message}`);
    });
  }

  sendData(res, logo);
});

/**
 * POST /api/admin/logos/bulk-fix — process every logo from its preserved
 * original. Idempotent, per-item isolation (one failure never aborts the batch),
 * never deletes an original before the new processed output exists.
 */
export const bulkFixLogos = asyncHandler(async (req, res) => {
  const options = readProcessingOptions(req.body);
  const logos = await Logo.find().sort({ sortOrder: 1, createdAt: 1 });

  const summary = { processed: 0, alreadyGood: 0, needsTransparentPng: 0, failed: 0, total: logos.length };
  const items = [];

  for (const logo of logos) {
    try {
      await ensureOriginal(logo);
      const bytes = await fetchStoredBytes(logo.originalPublicId);
      const processed = await processLogoImage(bytes, options);
      const next = processedFields(processed);

      if (isEquivalent(logo, next)) {
        // Nothing to do — never re-store or delete anything (idempotent).
        if (next.backgroundStatus === "needs-transparent-png") {
          summary.needsTransparentPng += 1;
          items.push({ id: logo._id, name: logo.name, status: "needs-transparent-png" });
        } else {
          summary.alreadyGood += 1;
          items.push({ id: logo._id, name: logo.name, status: "already-good" });
        }
        continue;
      }

      const previousProcessedId = logo.publicId;
      const fields = await persistProcessed(bytes, processed);
      Object.assign(logo, fields);
      await logo.save();
      if (previousProcessedId && previousProcessedId !== fields.publicId) {
        await deleteImage(previousProcessedId).catch(() => {});
      }

      if (fields.backgroundStatus === "needs-transparent-png") {
        summary.needsTransparentPng += 1;
        items.push({ id: logo._id, name: logo.name, status: "needs-transparent-png" });
      } else if (processed.buffer && processed.changed) {
        summary.processed += 1;
        items.push({ id: logo._id, name: logo.name, status: "processed" });
      } else {
        summary.alreadyGood += 1;
        items.push({ id: logo._id, name: logo.name, status: "already-good" });
      }
    } catch (error) {
      summary.failed += 1;
      items.push({ id: logo._id, name: logo.name, status: "failed", message: error.message });
    }
  }

  sendData(res, { summary, items });
});

/** DELETE /api/admin/logos/:id — remove processed + original assets, then the record. */
export const deleteLogo = asyncHandler(async (req, res) => {
  const logo = await Logo.findById(req.params.id);
  if (!logo) throw ApiError.notFound("Logo not found.");

  // Storage first: if cleanup fails we abort, keeping storage and DB consistent.
  const failures = await deleteLogoAssets(logo);
  if (failures.length > 0) {
    throw ApiError.internal("Some logo assets could not be removed from storage. Please retry.");
  }

  await Logo.deleteOne({ _id: logo._id });
  return sendData(res, { id: logo._id.toString() });
});

/** PATCH /api/admin/logos/reorder — body: { ids: string[] } */
export const reorderLogos = asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
  if (!ids || ids.length === 0) throw ApiError.badRequest("Provide an ordered list of logo ids.");

  await Promise.all(
    ids.map((id, index) =>
      Logo.findByIdAndUpdate(id, { $set: { sortOrder: (index + 1) * 10 } }).then((doc) => {
        if (!doc) throw ApiError.notFound(`Logo ${id} not found.`);
      }),
    ),
  );

  sendData(res, { reordered: ids.length });
});

/** PATCH /api/admin/logos/:id/visibility — body: { isVisible: boolean } */
export const setLogoVisibility = asyncHandler(async (req, res) => {
  const isVisible = Boolean(req.body?.isVisible);
  const logo = await Logo.findByIdAndUpdate(
    req.params.id,
    { $set: { isVisible } },
    { new: true, runValidators: true },
  );
  if (!logo) throw ApiError.notFound("Logo not found.");
  sendData(res, logo);
});
