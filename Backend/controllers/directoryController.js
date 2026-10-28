import Client from "../models/Client.js";
import Payee from "../models/Payee.js";
import CatalogItem from "../models/CatalogItem.js";
import Order from "../models/Order.js";
import { sendData, paginationMeta } from "../utils/apiResponse.js";
import { ApiError } from "../utils/errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { searchPattern } from "../utils/safeSearch.js";
import { ensureFinanceDefaults } from "../services/financeDefaults.js";

/* ------------------------------------------------------------------ utils */

function pageParams(req) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  return { page, limit };
}

const str = (value, max) => String(value ?? "").trim().slice(0, max);

/**
 * Order statistics for a page of clients — one aggregation over the page's ids
 * only (never a per-order loop in JS, never a full-collection scan).
 */
async function clientStats(ids) {
  if (ids.length === 0) return new Map();
  const rows = await Order.aggregate([
    { $match: { clientId: { $in: ids } } },
    {
      $group: {
        _id: "$clientId",
        orderCount: { $sum: 1 },
        billedMinor: { $sum: "$totalMinor" },
        paidMinor: { $sum: "$paidMinor" },
        lastOrderAt: { $max: "$createdAt" },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), row]));
}

/**
 * Paid-out and still-owed totals per payee, from the split snapshots.
 * `workers.$` and the optional referrer are unfolded by the aggregation.
 */
export async function payeeMoneyMap() {
  const rows = await Order.aggregate([
    { $match: { status: { $ne: "cancelled" } } },
    {
      $project: {
        shares: {
          $concatArrays: [
            { $cond: ["$split.referrer", [{ party: "referrer", share: "$split.referrer" }], []] },
            {
              $map: {
                input: { $ifNull: ["$split.workers", []] },
                as: "w",
                in: { party: "worker", share: "$$w" },
              },
            },
          ],
        },
      },
    },
    { $unwind: "$shares" },
    {
      $group: {
        _id: { payeeId: "$shares.share.payeeId", name: "$shares.share.name" },
        owedMinor: { $sum: "$shares.share.amountMinor" },
        paidOutMinor: {
          $sum: {
            $cond: ["$shares.share.paidOutAt", "$shares.share.amountMinor", 0],
          },
        },
        orders: { $sum: 1 },
      },
    },
    { $sort: { owedMinor: -1 } },
    { $limit: 500 },
  ]);
  return rows;
}

/* ----------------------------------------------------------------- clients */

/** GET /api/admin/clients — searchable, paginated, with per-client totals. */
export const listClients = asyncHandler(async (req, res) => {
  const { page, limit } = pageParams(req);
  const q = searchPattern(req.query.q);
  const active = String(req.query.active ?? "").trim();

  const filter = {};
  if (q) filter.$or = [{ name: q }, { phone: q }, { email: q }, { company: q }];
  if (active === "true") filter.isActive = true;
  if (active === "false") filter.isActive = false;

  const [items, total] = await Promise.all([
    Client.find(filter)
      .sort({ isActive: -1, name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Client.countDocuments(filter),
  ]);
  const stats = await clientStats(items.map((client) => client._id));

  const enriched = items.map((client) => {
    const stat = stats.get(String(client._id));
    return {
      ...client,
      orderCount: stat?.orderCount ?? 0,
      billedMinor: stat?.billedMinor ?? 0,
      paidMinor: stat?.paidMinor ?? 0,
      lastOrderAt: stat?.lastOrderAt ?? null,
    };
  });

  sendData(res, enriched, 200, paginationMeta({ page, limit, total }));
});

/** GET /api/admin/clients/:id */
export const getClient = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id).lean();
  if (!client) throw ApiError.notFound("Client not found.");

  const [stats, orders] = await Promise.all([
    clientStats([client._id]),
    Order.find({ clientId: client._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("invoiceNumber title status paymentStatus totalMinor paidMinor createdAt")
      .lean(),
  ]);
  const stat = stats.get(String(client._id));

  sendData(res, {
    ...client,
    orderCount: stat?.orderCount ?? 0,
    billedMinor: stat?.billedMinor ?? 0,
    paidMinor: stat?.paidMinor ?? 0,
    lastOrderAt: stat?.lastOrderAt ?? null,
    orders,
  });
});

/** POST /api/admin/clients */
export const createClient = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const client = await Client.create({
    name: str(body.name, 120),
    phone: str(body.phone, 40),
    email: str(body.email, 120),
    company: str(body.company, 120),
    address: str(body.address, 240),
    notes: str(body.notes, 500),
    isActive: body.isActive === false ? false : true,
  });
  sendData(res, client, 201);
});

/** PUT /api/admin/clients/:id — edit and/or soft-deactivate. */
export const updateClient = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) throw ApiError.notFound("Client not found.");

  const body = req.body || {};
  if (body.name !== undefined) client.name = str(body.name, 120);
  if (body.phone !== undefined) client.phone = str(body.phone, 40);
  if (body.email !== undefined) client.email = str(body.email, 120);
  if (body.company !== undefined) client.company = str(body.company, 120);
  if (body.address !== undefined) client.address = str(body.address, 240);
  if (body.notes !== undefined) client.notes = str(body.notes, 500);
  if (body.isActive !== undefined) client.isActive = Boolean(body.isActive);

  await client.save();
  sendData(res, client.toObject());
});

/**
 * DELETE /api/admin/clients/:id
 * Clients are deactivated, not destroyed. A client that already has orders is
 * refused with 409 so the order history keeps the name it was billed under.
 */
export const deleteClient = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) throw ApiError.notFound("Client not found.");

  const orders = await Order.countDocuments({ clientId: client._id });
  if (orders > 0) {
    throw ApiError.conflict(
      `This client has ${orders} order${orders === 1 ? "" : "s"} and cannot be deleted. Deactivate it instead.`,
      { clientId: "Client has orders — deactivate instead of deleting." },
    );
  }

  await client.deleteOne();
  sendData(res, { id: client._id.toString(), deleted: true });
});

/* ------------------------------------------------------------------ payees */

/** GET /api/admin/payees — with owed / paid-out totals. */
export const listPayees = asyncHandler(async (req, res) => {
  const { page, limit } = pageParams(req);
  const q = searchPattern(req.query.q);
  const role = String(req.query.role ?? "").trim();
  const active = String(req.query.active ?? "").trim();

  const filter = {};
  if (q) filter.$or = [{ name: q }, { phone: q }];
  if (role === "worker" || role === "referrer" || role === "both") filter.role = role;
  if (active === "true") filter.isActive = true;
  if (active === "false") filter.isActive = false;

  const [items, total, moneyRows] = await Promise.all([
    Payee.find(filter)
      .sort({ isActive: -1, name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Payee.countDocuments(filter),
    payeeMoneyMap(),
  ]);

  const money = new Map(
    moneyRows.map((row) => [
      row._id.payeeId ? String(row._id.payeeId) : `name:${row._id.name}`,
      row,
    ]),
  );

  const enriched = items.map((payee) => {
    const stat = money.get(String(payee._id)) ?? money.get(`name:${payee.name}`);
    return {
      ...payee,
      owedMinor: stat?.owedMinor ?? 0,
      paidOutMinor: stat?.paidOutMinor ?? 0,
      orderCount: stat?.orders ?? 0,
    };
  });

  sendData(res, enriched, 200, paginationMeta({ page, limit, total }));
});

/** POST /api/admin/payees */
export const createPayee = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const payee = await Payee.create({
    name: str(body.name, 120),
    role: body.role || "worker",
    phone: str(body.phone, 40),
    notes: str(body.notes, 300),
    isActive: body.isActive === false ? false : true,
  });
  sendData(res, payee, 201);
});

/** PUT /api/admin/payees/:id */
export const updatePayee = asyncHandler(async (req, res) => {
  const payee = await Payee.findById(req.params.id);
  if (!payee) throw ApiError.notFound("Person not found.");

  const body = req.body || {};
  if (body.name !== undefined) payee.name = str(body.name, 120);
  if (body.role !== undefined) payee.role = body.role;
  if (body.phone !== undefined) payee.phone = str(body.phone, 40);
  if (body.notes !== undefined) payee.notes = str(body.notes, 300);
  if (body.isActive !== undefined) payee.isActive = Boolean(body.isActive);

  await payee.save();
  sendData(res, payee.toObject());
});

/* ----------------------------------------------------------------- catalog */

/**
 * GET /api/admin/order-catalog
 * Also bootstraps the defaults (lazy, idempotent) so a fresh production
 * database works without re-running any seed.
 */
export const listCatalog = asyncHandler(async (req, res) => {
  await ensureFinanceDefaults();
  const includeInactive = String(req.query.includeInactive ?? "") === "true";
  const filter = includeInactive ? {} : { isActive: true };
  const items = await CatalogItem.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
  sendData(res, items);
});

/** POST /api/admin/order-catalog */
export const createCatalogItem = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const name = str(body.name, 120);
  const nameKey = name.toLowerCase();

  const clash = await CatalogItem.findOne({ nameKey }).lean();
  if (clash) {
    throw ApiError.conflict("An item with this name already exists.", {
      name: "An item with this name already exists.",
    });
  }

  const item = await CatalogItem.create({
    name,
    unitLabel: str(body.unitLabel, 24) || "item",
    defaultUnitPriceMinor: Number.isInteger(body.defaultUnitPriceMinor) ? body.defaultUnitPriceMinor : 0,
    isActive: body.isActive === false ? false : true,
    sortOrder: Number.isInteger(body.sortOrder) ? body.sortOrder : 0,
  });
  sendData(res, item, 201);
});

/** PUT /api/admin/order-catalog/:id */
export const updateCatalogItem = asyncHandler(async (req, res) => {
  const item = await CatalogItem.findById(req.params.id);
  if (!item) throw ApiError.notFound("Catalogue item not found.");

  const body = req.body || {};
  if (body.name !== undefined) {
    const name = str(body.name, 120);
    const nameKey = name.toLowerCase();
    const clash = await CatalogItem.findOne({ nameKey, _id: { $ne: item._id } }).lean();
    if (clash) {
      throw ApiError.conflict("An item with this name already exists.", {
        name: "An item with this name already exists.",
      });
    }
    item.name = name;
  }
  if (body.unitLabel !== undefined) item.unitLabel = str(body.unitLabel, 24) || "item";
  if (body.defaultUnitPriceMinor !== undefined && Number.isInteger(body.defaultUnitPriceMinor)) {
    item.defaultUnitPriceMinor = Math.max(0, body.defaultUnitPriceMinor);
  }
  if (body.isActive !== undefined) item.isActive = Boolean(body.isActive);
  if (body.sortOrder !== undefined && Number.isInteger(body.sortOrder)) item.sortOrder = body.sortOrder;

  await item.save();
  sendData(res, item.toObject());
});
