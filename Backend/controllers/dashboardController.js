import mongoose from "mongoose";
import Product from "../models/Product.js";
import Logo from "../models/Logo.js";
import Submission from "../models/Submission.js";
import Visitor from "../models/Visitor.js";
import { sendData } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * GET /api/admin/dashboard/stats — every number is computed from the database.
 * An empty database reports zeros (and empty chart series), never fake data.
 */
export const getDashboardStats = asyncHandler(async (_req, res) => {
  const today = startOfUtcDay();
  const days = 14;
  const seriesStart = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

  const [products, logos, submissionsAgg, uniqueToday, uniqueTotal, visitsAgg, seriesAgg] =
    await Promise.all([
      Product.countDocuments(),
      Logo.countDocuments(),
      Submission.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Visitor.distinct("normalizedIp", { lastVisitedAt: { $gte: today } }).then((ips) => ips.length),
      Visitor.distinct("normalizedIp").then((ips) => ips.length),
      Visitor.aggregate([{ $group: { _id: null, total: { $sum: "$visitCount" } } }]),
      Visitor.aggregate([
        { $match: { visitDate: { $gte: seriesStart } } },
        {
          $group: {
            _id: { $dateTrunc: { date: "$visitDate", unit: "day", timezone: "UTC" } },
            uniqueVisitors: { $sum: 1 },
            visits: { $sum: "$visitCount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

  const submissionsByStatus = { New: 0, Contacted: 0, Closed: 0 };
  let submissionsTotal = 0;
  for (const row of submissionsAgg) {
    if (row._id in submissionsByStatus) submissionsByStatus[row._id] = row.count;
    submissionsTotal += row.count;
  }

  // Build a gap-free 14-day series so the SVG chart always has consistent x-axis.
  const byDay = new Map(seriesAgg.map((row) => [row._id.toISOString().slice(0, 10), row]));
  const series = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(seriesStart.getTime() + i * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    const row = byDay.get(key);
    series.push({
      date: key,
      uniqueVisitors: row?.uniqueVisitors || 0,
      visits: row?.visits || 0,
    });
  }

  sendData(res, {
    products,
    logos,
    submissions: {
      total: submissionsTotal,
      ...submissionsByStatus,
    },
    visitors: {
      todayUnique: uniqueToday,
      totalUnique: uniqueTotal,
      totalVisits: visitsAgg[0]?.total || 0,
      series,
    },
    generatedAt: new Date().toISOString(),
    mongoReady: mongoose.connection.readyState === 1,
  });
});

export default getDashboardStats;
