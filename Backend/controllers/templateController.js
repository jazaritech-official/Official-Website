import ProductTypeTemplate from "../models/ProductTypeTemplate.js";
import { sendData } from "../utils/apiResponse.js";
import { ApiError } from "../utils/errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function sanitizePoints(points) {
  if (!Array.isArray(points)) return [];
  return points
    .map((point) => String(point).trim())
    .filter((point) => point.length >= 2)
    .slice(0, 8);
}

/** GET /api/admin/product-type-templates */
export const listTemplates = asyncHandler(async (_req, res) => {
  const templates = await ProductTypeTemplate.find().sort({ type: 1 }).lean();
  sendData(res, templates);
});

/** POST /api/admin/product-type-templates */
export const createTemplate = asyncHandler(async (req, res) => {
  const type = String(req.body?.type || "").trim();
  const highlightPoints = sanitizePoints(req.body?.highlightPoints);
  if (!type) throw ApiError.badRequest("Template type is required.");
  if (highlightPoints.length === 0) throw ApiError.badRequest("Add at least one suggested highlight point.");

  const template = await ProductTypeTemplate.create({ type, highlightPoints });
  sendData(res, template, 201);
});

/** PUT /api/admin/product-type-templates/:id */
export const updateTemplate = asyncHandler(async (req, res) => {
  const updates = {};
  if (req.body?.type !== undefined) updates.type = String(req.body.type).trim();
  if (req.body?.highlightPoints !== undefined) {
    updates.highlightPoints = sanitizePoints(req.body.highlightPoints);
    if (updates.highlightPoints.length === 0) {
      throw ApiError.badRequest("Add at least one suggested highlight point.");
    }
  }

  const template = await ProductTypeTemplate.findByIdAndUpdate(req.params.id, { $set: updates }, {
    new: true,
    runValidators: true,
  });
  if (!template) throw ApiError.notFound("Template not found.");
  sendData(res, template);
});

/** DELETE /api/admin/product-type-templates/:id */
export const deleteTemplate = asyncHandler(async (req, res) => {
  const template = await ProductTypeTemplate.findByIdAndDelete(req.params.id);
  if (!template) throw ApiError.notFound("Template not found.");
  sendData(res, { id: template._id.toString() });
});
