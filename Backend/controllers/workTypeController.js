import WorkType from "../models/WorkType.js";
import Order from "../models/Order.js";
import { sendData, paginationMeta } from "../utils/apiResponse.js";
import { ApiError } from "../utils/errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { searchPattern } from "../utils/safeSearch.js";

/**
 * WORK TYPES — the admin-managed price list (JWT only, no public endpoint).
 *
 * Rules that matter:
 *  · the name is unique among ACTIVE work types (a deactivated duplicate is
 *    allowed, but reactivating it is refused while an active twin exists);
 *  · a type that any order references is SOFT-deactivated, never destroyed —
 *    DELETE falls back to deactivation and says so in its response;
 *  · a type with no orders can be hard-deleted;
 *  · prices are INTEGER paisa, exactly like every other money value.
 */
const str = (value, max) => String(value ?? "").trim().slice(0, max);

const nameKeyOf = (name) => String(name).trim().toLowerCase();

/** How many orders reference each of these work types (one aggregation). */
async function usageCounts(ids) {
  if (ids.length === 0) return new Map();
  const rows = await Order.aggregate([
    { $match: { "items.workTypeId": { $in: ids } } },
    { $unwind: "$items" },
    { $match: { "items.workTypeId": { $in: ids } } },
    { $group: { _id: "$items.workTypeId", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

async function assertNameFree(name, excludeId = null) {
  const nameKey = nameKeyOf(name);
  const filter = { nameKey };
  if (excludeId) filter._id = { $ne: excludeId };
  const clash = await WorkType.findOne(filter).lean();
  if (clash) {
    if (clash.isActive === false) {
      throw ApiError.conflict("A deactivated work type already has this name — reactivate it instead.", {
        name: "This name belongs to a deactivated work type.",
      });
    }
    throw ApiError.conflict("A work type with this name already exists.", {
      name: "A work type with this name already exists.",
    });
  }
}

function present(workType, count = 0) {
  return { ...workType, orderCount: count };
}

/** GET /api/admin/work-types — ?q= ?includeInactive=true */
export const listWorkTypes = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
  const includeInactive = String(req.query.includeInactive ?? "") === "true";
  const pattern = searchPattern(req.query.q);

  const filter = {};
  if (!includeInactive) filter.isActive = true;
  if (pattern) filter.name = pattern;

  const [rows, total] = await Promise.all([
    WorkType.find(filter)
      .sort({ isActive: -1, sortOrder: 1, name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    WorkType.countDocuments(filter),
  ]);

  const counts = await usageCounts(rows.map((row) => row._id));
  sendData(
    res,
    rows.map((row) => present(row, counts.get(String(row._id)) ?? 0)),
    200,
    paginationMeta({ page, limit, total }),
  );
});

/** POST /api/admin/work-types */
export const createWorkType = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const name = str(body.name, 60);
  if (name.length < 1) {
    throw ApiError.badRequest("Name is required.", { name: "Give the work type a name (1–60 characters)." });
  }
  await assertNameFree(name);

  const workType = await WorkType.create({
    name,
    nameKey: nameKeyOf(name),
    unitPrice: Number.isInteger(body.unitPrice) ? Math.max(0, body.unitPrice) : 0,
    currency: str(body.currency, 8).toUpperCase() || "PKR",
    description: str(body.description, 160),
    isActive: body.isActive === false ? false : true,
    sortOrder: Number.isInteger(body.sortOrder) ? body.sortOrder : 0,
  });

  sendData(res, present(workType.toObject(), 0), 201);
});

/** PUT /api/admin/work-types/:id */
export const updateWorkType = asyncHandler(async (req, res) => {
  const workType = await WorkType.findById(req.params.id);
  if (!workType) throw ApiError.notFound("Work type not found.");

  const body = req.body || {};
  if (body.name !== undefined) {
    const name = str(body.name, 60);
    if (name.length < 1) {
      throw ApiError.badRequest("Name is required.", { name: "Give the work type a name (1–60 characters)." });
    }
    if (nameKeyOf(name) !== workType.nameKey) {
      // Renaming into a deactivated twin's name is refused on save (below).
      await assertNameFree(name, workType._id);
    }
    workType.name = name;
    workType.nameKey = nameKeyOf(name);
  }
  if (body.unitPrice !== undefined) {
    if (!Number.isInteger(body.unitPrice) || body.unitPrice < 0) {
      throw ApiError.badRequest("Enter a valid price.", { unitPrice: "Enter a whole rupee amount of zero or more." });
    }
    workType.unitPrice = body.unitPrice;
  }
  if (body.currency !== undefined) workType.currency = str(body.currency, 8).toUpperCase() || "PKR";
  if (body.description !== undefined) workType.description = str(body.description, 160);
  if (body.sortOrder !== undefined && Number.isInteger(body.sortOrder)) workType.sortOrder = body.sortOrder;
  if (body.isActive !== undefined) {
    const next = Boolean(body.isActive);
    if (next && !workType.isActive) {
      // Reactivation must not create a second active twin.
      await assertNameFree(workType.name, workType._id);
    }
    workType.isActive = next;
  }

  try {
    await workType.save();
  } catch (error) {
    if (error?.code === 11000) {
      throw ApiError.conflict("A work type with this name already exists.", {
        name: "A work type with this name already exists.",
      });
    }
    throw error;
  }

  const counts = await usageCounts([workType._id]);
  sendData(res, present(workType.toObject(), counts.get(String(workType._id)) ?? 0));
});

/** PATCH /api/admin/work-types/:id/deactivate  { isActive: boolean } */
export const deactivateWorkType = asyncHandler(async (req, res) => {
  const workType = await WorkType.findById(req.params.id);
  if (!workType) throw ApiError.notFound("Work type not found.");

  const next = req.body?.isActive !== false;
  if (next && !workType.isActive) await assertNameFree(workType.name, workType._id);
  workType.isActive = next;
  await workType.save();

  const counts = await usageCounts([workType._id]);
  sendData(res, present(workType.toObject(), counts.get(String(workType._id)) ?? 0));
});

/**
 * DELETE /api/admin/work-types/:id
 * Referenced by orders → SOFT-deactivate (the orders keep their snapshots);
 * unused → hard delete. The response says which happened.
 */
export const deleteWorkType = asyncHandler(async (req, res) => {
  const workType = await WorkType.findById(req.params.id);
  if (!workType) throw ApiError.notFound("Work type not found.");

  const orders = await Order.countDocuments({ "items.workTypeId": workType._id });
  if (orders > 0) {
    workType.isActive = false;
    await workType.save();
    return sendData(res, {
      id: workType._id.toString(),
      deleted: false,
      deactivated: true,
      orderCount: orders,
      message: `In use by ${orders} order${orders === 1 ? "" : "s"} — deactivated instead of deleted.`,
    });
  }

  await workType.deleteOne();
  return sendData(res, { id: workType._id.toString(), deleted: true, deactivated: false, orderCount: 0 });
});

/** POST /api/admin/work-types/reorder  { ids: [...] } */
export const reorderWorkTypes = asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (ids.length === 0 || !ids.every((id) => /^[a-f0-9]{24}$/i.test(String(id)))) {
    throw ApiError.badRequest("Provide the work type ids in their new order.", {
      ids: "Provide a list of work type ids.",
    });
  }

  const operations = ids.map((id, index) => ({
    updateOne: { filter: { _id: id }, update: { $set: { sortOrder: (index + 1) * 10 } } },
  }));
  const result = await WorkType.bulkWrite(operations);
  sendData(res, { reordered: result.modifiedCount ?? ids.length, order: ids });
});
