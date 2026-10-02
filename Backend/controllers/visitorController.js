import env from "../config/env.js";
import Visitor from "../models/Visitor.js";
import { sendData, paginationMeta } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getClientIp, normalizeIp } from "../utils/ip.js";

const WINDOW_MS = () => env.visitor.dedupeWindowHours * 60 * 60 * 1000;

/**
 * POST /api/visitor-track — public beacon.
 * Dedupe: repeated hits from the same normalized IP inside the configured
 * window (default 24h ⇒ one document per IP per day) increment visitCount.
 */
export const trackVisitor = asyncHandler(async (req, res) => {
  const ip = getClientIp(req);
  const normalizedIp = normalizeIp(ip);
  const userAgent = String(req.headers["user-agent"] || "").slice(0, 400);
  const page = String(req.body?.page || "").slice(0, 500);
  const referrer = String(req.body?.referrer || "").slice(0, 500);
  const now = new Date();

  const existing = await Visitor.findOne({
    normalizedIp,
    visitDate: { $gte: new Date(now.getTime() - WINDOW_MS()) },
  })
    .sort({ visitDate: -1 })
    .lean();

  if (existing) {
    await Visitor.updateOne(
      { _id: existing._id },
      {
        $inc: { visitCount: 1 },
        $set: {
          lastVisitedAt: now,
          ...(page ? { page } : {}),
          ...(referrer ? { referrer } : {}),
          ...(userAgent ? { userAgent } : {}),
          ...(ip ? { ip } : {}),
        },
      },
    );
    return sendData(res, { tracked: true, deduplicated: true });
  }

  await Visitor.create({
    ip,
    normalizedIp,
    userAgent,
    page,
    referrer,
    visitDate: now,
    lastVisitedAt: now,
    visitCount: 1,
  });

  return sendData(res, { tracked: true, deduplicated: false }, 201);
});

/** GET /api/admin/visitors — paginated analytics list. */
export const listVisitors = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  const search = String(req.query.q || "").trim();

  const filter = {};
  if (search) {
    filter.$or = [
      { normalizedIp: { $regex: search, $options: "i" } },
      { page: { $regex: search, $options: "i" } },
      { referrer: { $regex: search, $options: "i" } },
    ];
  }

  const from = Date.parse(req.query.from);
  const to = Date.parse(req.query.to);
  if (!Number.isNaN(from)) filter.lastVisitedAt = { ...filter.lastVisitedAt, $gte: new Date(from) };
  if (!Number.isNaN(to)) {
    const endOfDay = new Date(to);
    endOfDay.setHours(23, 59, 59, 999);
    filter.lastVisitedAt = { ...filter.lastVisitedAt, $lte: endOfDay };
  }

  const [items, total, totalRecords] = await Promise.all([
    Visitor.find(filter)
      .sort({ lastVisitedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("-__v")
      .lean(),
    Visitor.countDocuments(filter),
    Visitor.countDocuments(),
  ]);

  sendData(res, items, 200, {
    ...paginationMeta({ page, limit, total }),
    totalRecords,
  });
});

export default { trackVisitor, listVisitors };
