import mongoose from "mongoose";
import Product from "../models/Product.js";
import Logo from "../models/Logo.js";
import { sendData, paginationMeta } from "../utils/apiResponse.js";
import { ApiError } from "../utils/errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const PUBLIC_FIELDS = "name logo logoId productUrl category highlightPoints sortOrder createdAt";
/** Safe logo projection — never publicId, originalUrl or other internal refs. */
const LOGO_FIELDS = "name displayName secureUrl alt tone hasAlpha aspectRatio";

/**
 * Shape a product's logo into the public contract.
 *
 * `logoId` is referenced (never copied) from the Logo collection. A legacy
 * non-empty `logo` URL string is still honoured so old documents keep working.
 * Always returns `{ id, url, displayName, alt, tone, hasAlpha, aspectRatio }`
 * or `null` — never internal storage identifiers.
 */
function projectProductLogo(doc) {
  const ref = doc.logoId;
  if (ref && typeof ref === "object") {
    return {
      id: String(ref._id),
      url: ref.secureUrl ?? "",
      displayName: ref.displayName || ref.name || "",
      alt: ref.alt || ref.displayName || ref.name || "",
      tone: ref.tone ?? "light",
      hasAlpha: ref.hasAlpha ?? null,
      aspectRatio: ref.aspectRatio ?? null,
    };
  }
  if (typeof doc.logo === "string" && doc.logo.trim()) {
    return {
      id: null,
      url: doc.logo.trim(),
      displayName: doc.name,
      alt: doc.name,
      tone: null,
      hasAlpha: null,
      aspectRatio: null,
    };
  }
  return null;
}

function toPublicProduct(doc) {
  return {
    _id: doc._id,
    name: doc.name,
    logo: projectProductLogo(doc),
    productUrl: doc.productUrl,
    category: doc.category,
    highlightPoints: doc.highlightPoints,
    sortOrder: doc.sortOrder,
    createdAt: doc.createdAt,
  };
}

/** Admin projection: the raw reference id PLUS the resolved logo object. */
function toAdminProduct(doc) {
  const ref = doc.logoId;
  const logoId = ref && typeof ref === "object" ? String(ref._id) : ref ? String(ref) : null;
  return { ...doc, logoId, logo: projectProductLogo(doc) };
}

/** Reload a saved product with its logo reference populated (admin responses). */
async function loadAdminProduct(id) {
  const doc = await Product.findById(id).populate("logoId", LOGO_FIELDS).lean();
  return doc ? toAdminProduct(doc) : null;
}

/**
 * Validate an incoming `logoId`. `undefined` = leave unchanged; `null`/"" =
 * detach; otherwise it must be a real ObjectId that exists. Field-level errors
 * always carry a `logoId` detail so the editor can surface it inline.
 */
async function resolveLogoId(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const value = String(raw);
  if (!mongoose.isValidObjectId(value)) {
    throw ApiError.badRequest("Choose a logo from the list.", { logoId: "Invalid logo reference." });
  }
  const exists = await Logo.exists({ _id: value });
  if (!exists) {
    throw ApiError.badRequest("That logo no longer exists.", {
      logoId: "The selected logo was removed. Pick another or use the monogram.",
    });
  }
  return value;
}

/** GET /api/products — published products only. */
export const listPublicProducts = asyncHandler(async (_req, res) => {
  const products = await Product.find({ isPublished: true })
    .sort({ sortOrder: 1, createdAt: -1 })
    .select(PUBLIC_FIELDS)
    .populate("logoId", LOGO_FIELDS)
    .lean();
  sendData(res, products.map(toPublicProduct));
});

/** GET /api/admin/products */
export const listAdminProducts = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const search = String(req.query.q || "").trim();

  const filter = {};
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { category: { $regex: search, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort({ sortOrder: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("logoId", LOGO_FIELDS)
      .lean(),
    Product.countDocuments(filter),
  ]);

  sendData(
    res,
    items.map(toAdminProduct),
    200,
    paginationMeta({ page, limit, total }),
  );
});

/** GET /api/admin/products/:id */
export const getProduct = asyncHandler(async (req, res) => {
  const product = await loadAdminProduct(req.params.id);
  if (!product) throw ApiError.notFound("Product not found.");
  sendData(res, product);
});

/** POST /api/admin/products */
export const createProduct = asyncHandler(async (req, res) => {
  const input = sanitizeProductInput(req.body);
  const logoId = await resolveLogoId(req.body.logoId);
  if (logoId !== undefined) input.logoId = logoId;

  const product = await Product.create(input);
  sendData(res, await loadAdminProduct(product._id), 201);
});

/** PUT /api/admin/products/:id */
export const updateProduct = asyncHandler(async (req, res) => {
  const input = sanitizeProductInput(req.body);
  const logoId = await resolveLogoId(req.body.logoId);
  if (logoId !== undefined) input.logoId = logoId;

  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { $set: input },
    { new: true, runValidators: true },
  );
  if (!product) throw ApiError.notFound("Product not found.");
  sendData(res, await loadAdminProduct(product._id));
});

/** DELETE /api/admin/products/:id */
export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) throw ApiError.notFound("Product not found.");
  sendData(res, { id: product._id.toString() });
});

/** PATCH /api/admin/products/reorder — body: { ids: string[] } */
export const reorderProducts = asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
  if (!ids || ids.length === 0) throw ApiError.badRequest("Provide an ordered list of product ids.");

  await Promise.all(
    ids.map((id, index) =>
      Product.findByIdAndUpdate(id, { $set: { sortOrder: (index + 1) * 10 } }).then((doc) => {
        if (!doc) throw ApiError.notFound(`Product ${id} not found.`);
      }),
    ),
  );

  sendData(res, { reordered: ids.length });
});

/** Whitelist + normalize client input (never trust the payload shape). */
function sanitizeProductInput(body = {}) {
  const allowed = [
    "name",
    "logo",
    "logoId",
    "productUrl",
    "category",
    "highlightPoints",
    "isPublished",
    "sortOrder",
  ];
  const input = {};
  for (const key of allowed) {
    if (body[key] !== undefined) input[key] = body[key];
  }

  if (Array.isArray(input.highlightPoints)) {
    input.highlightPoints = input.highlightPoints
      .map((point) => String(point).trim())
      .filter((point) => point.length > 0);
  }
  if (typeof input.productUrl === "string") input.productUrl = input.productUrl.trim();
  if (input.sortOrder !== undefined) input.sortOrder = Number(input.sortOrder) || 0;
  if (input.isPublished !== undefined) input.isPublished = Boolean(input.isPublished);

  return input;
}
