import Product from "../models/Product.js";
import { sendData, paginationMeta } from "../utils/apiResponse.js";
import { ApiError } from "../utils/errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const PUBLIC_FIELDS = "name logo productUrl category highlightPoints sortOrder createdAt";

/** GET /api/products — published products only. */
export const listPublicProducts = asyncHandler(async (_req, res) => {
  const products = await Product.find({ isPublished: true })
    .sort({ sortOrder: 1, createdAt: -1 })
    .select(PUBLIC_FIELDS)
    .lean();
  sendData(res, products);
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
      .lean(),
    Product.countDocuments(filter),
  ]);

  sendData(res, items, 200, paginationMeta({ page, limit, total }));
});

/** GET /api/admin/products/:id */
export const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).lean();
  if (!product) throw ApiError.notFound("Product not found.");
  sendData(res, product);
});

/** POST /api/admin/products */
export const createProduct = asyncHandler(async (req, res) => {
  const product = await Product.create(sanitizeProductInput(req.body));
  sendData(res, product, 201);
});

/** PUT /api/admin/products/:id */
export const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { $set: sanitizeProductInput(req.body) },
    { new: true, runValidators: true },
  );
  if (!product) throw ApiError.notFound("Product not found.");
  sendData(res, product);
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
  const allowed = ["name", "logo", "productUrl", "category", "highlightPoints", "isPublished", "sortOrder"];
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
