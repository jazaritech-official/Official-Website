import Logo from "../models/Logo.js";
import { uploadImage, deleteImage, storageDriver } from "../services/storageService.js";
import { sendData } from "../utils/apiResponse.js";
import { ApiError } from "../utils/errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function normalizeLogoInput(body = {}) {
  const updates = {};
  if (body.name !== undefined) updates.name = String(body.name).trim();
  if (body.alt !== undefined) updates.alt = String(body.alt).trim();
  if (body.isVisible !== undefined) updates.isVisible = Boolean(body.isVisible);
  if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder) || 0;
  return updates;
}

/** GET /api/logos — visible logos for the public marquee. */
export const listPublicLogos = asyncHandler(async (_req, res) => {
  const logos = await Logo.find({ isVisible: true })
    .sort({ sortOrder: 1, createdAt: 1 })
    .select("name secureUrl alt sortOrder")
    .lean();
  sendData(res, logos);
});

/** GET /api/admin/logos */
export const listAdminLogos = asyncHandler(async (_req, res) => {
  const logos = await Logo.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
  sendData(res, { logos, driver: storageDriver });
});

/** POST /api/admin/logos — upload to storage, then persist metadata. */
export const createLogo = asyncHandler(async (req, res) => {
  const { name, alt, isVisible, sortOrder } = normalizeLogoInput(req.body);
  const image = req.body?.image;

  if (!name) throw ApiError.badRequest("Logo name is required.", { name: "Logo name is required." });
  if (!image) throw ApiError.badRequest("Choose an image to upload.", { image: "Image is required." });

  const stored = await uploadImage(image);

  try {
    const logo = await Logo.create({
      name,
      alt: alt || name,
      isVisible: isVisible ?? true,
      sortOrder: sortOrder ?? 0,
      secureUrl: stored.secureUrl,
      publicId: stored.publicId,
    });
    return sendData(res, logo, 201);
  } catch (error) {
    // Roll back the uploaded asset so no orphan file is left behind.
    await deleteImage(stored.publicId).catch(() => {});
    throw error;
  }
});

/** PUT /api/admin/logos/:id — metadata and/or image replacement. */
export const updateLogo = asyncHandler(async (req, res) => {
  const logo = await Logo.findById(req.params.id);
  if (!logo) throw ApiError.notFound("Logo not found.");

  const updates = normalizeLogoInput(req.body);
  const previousPublicId = logo.publicId;
  const replacing = Boolean(req.body?.image);

  if (replacing) {
    const stored = await uploadImage(req.body.image);
    updates.secureUrl = stored.secureUrl;
    updates.publicId = stored.publicId;
  }

  Object.assign(logo, updates);
  await logo.save();

  if (replacing) {
    // Best effort: the new asset is already live, so a stale old copy is only
    // a (logged) storage leak, never broken public content.
    await deleteImage(previousPublicId).catch((error) => {
      console.warn(`[logos] could not remove previous asset ${previousPublicId}: ${error.message}`);
    });
  }

  return sendData(res, logo);
});

/** DELETE /api/admin/logos/:id — storage first, then the database record. */
export const deleteLogo = asyncHandler(async (req, res) => {
  const logo = await Logo.findById(req.params.id);
  if (!logo) throw ApiError.notFound("Logo not found.");

  // 1. delete the hosted asset  2. delete the Mongo record.
  // If step 1 fails we abort, keeping storage and database consistent.
  await deleteImage(logo.publicId);
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
