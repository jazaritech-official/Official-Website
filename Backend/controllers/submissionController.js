import Submission from "../models/Submission.js";
import { sendData, paginationMeta } from "../utils/apiResponse.js";
import { ApiError } from "../utils/errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getClientIp } from "../utils/ip.js";
import { createReferenceId } from "../utils/referenceId.js";
import { toCsv } from "../utils/csv.js";

// Accidental double-submits (double click / retried fetch) within this window
// return the original reference instead of creating a duplicate.
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

/**
 * POST /api/submission — public intake.
 * A honeypot field (`website`) silently swallows bot submissions.
 */
export const createSubmission = asyncHandler(async (req, res) => {
  const body = req.body || {};

  // Honeypot: invisible to real visitors, irresistible to bots.
  if (String(body.website || "").trim().length > 0) {
    return sendData(res, { referenceId: createReferenceId(), accepted: true }, 201);
  }

  const name = String(body.name || "").trim();
  const domain = String(body.domain || "").trim();
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const service = String(body.service || "").trim();

  if (!name) throw ApiError.badRequest("Name is required.", { name: "Name is required." });
  if (!service) throw ApiError.badRequest("Service is required.", { service: "Service is required." });
  if (!phone && !email) {
    throw ApiError.badRequest("Provide at least a phone number or an email address.", {
      contact: "Provide at least a phone number or an email address.",
    });
  }

  // Return the existing reference if the same person submits again shortly.
  const duplicateFilter = {
    service,
    createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    ...(email
      ? { email }
      : { phone }),
  };
  const recent = await Submission.findOne(duplicateFilter).sort({ createdAt: -1 }).lean();
  if (recent) {
    return sendData(res, { referenceId: recent.referenceId, accepted: true, duplicate: true }, 200);
  }

  const submission = await Submission.create({
    name,
    domain,
    phone,
    email,
    service,
    referenceId: createReferenceId(),
    visitorIp: getClientIp(req),
    status: "New",
  });

  return sendData(res, { referenceId: submission.referenceId, accepted: true }, 201);
});

/** GET /api/admin/submissions — search, filter, paginate. */
export const listSubmissions = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const search = String(req.query.q || "").trim();
  const status = String(req.query.status || "").trim();

  const filter = {};
  if (status && ["New", "Contacted", "Closed"].includes(status)) filter.status = status;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { domain: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { service: { $regex: search, $options: "i" } },
      { referenceId: { $regex: search, $options: "i" } },
    ];
  }
  const from = Date.parse(req.query.from);
  const to = Date.parse(req.query.to);
  if (!Number.isNaN(from)) filter.createdAt = { ...filter.createdAt, $gte: new Date(from) };
  if (!Number.isNaN(to)) {
    const endOfDay = new Date(to);
    endOfDay.setHours(23, 59, 59, 999);
    filter.createdAt = { ...filter.createdAt, $lte: endOfDay };
  }

  const [items, total] = await Promise.all([
    Submission.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Submission.countDocuments(filter),
  ]);

  sendData(res, items, 200, paginationMeta({ page, limit, total }));
});

/** GET /api/admin/submissions/:id */
export const getSubmission = asyncHandler(async (req, res) => {
  const submission = await Submission.findById(req.params.id).lean();
  if (!submission) throw ApiError.notFound("Submission not found.");
  sendData(res, submission);
});

/** PATCH /api/admin/submissions/:id/status — { status } */
export const updateSubmissionStatus = asyncHandler(async (req, res) => {
  const status = String(req.body?.status || "");
  if (!["New", "Contacted", "Closed"].includes(status)) {
    throw ApiError.badRequest("Status must be New, Contacted or Closed.", {
      status: "Status must be New, Contacted or Closed.",
    });
  }

  const submission = await Submission.findByIdAndUpdate(
    req.params.id,
    { $set: { status } },
    { new: true, runValidators: true },
  );
  if (!submission) throw ApiError.notFound("Submission not found.");
  sendData(res, submission);
});

/** DELETE /api/admin/submissions/:id */
export const deleteSubmission = asyncHandler(async (req, res) => {
  const submission = await Submission.findByIdAndDelete(req.params.id);
  if (!submission) throw ApiError.notFound("Submission not found.");
  sendData(res, { id: submission._id.toString() });
});

/** GET /api/admin/submissions/export — CSV download (escaped, injection-safe). */
export const exportSubmissions = asyncHandler(async (req, res) => {
  const status = String(req.query.status || "").trim();
  const filter = {};
  if (status && ["New", "Contacted", "Closed"].includes(status)) filter.status = status;

  const items = await Submission.find(filter).sort({ createdAt: -1 }).lean();

  const csv = toCsv(items, [
    { key: "referenceId", label: "Reference ID" },
    { key: "name", label: "Name" },
    { key: "domain", label: "Domain" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "service", label: "Service" },
    { key: "status", label: "Status" },
    { key: "visitorIp", label: "Visitor IP" },
    { key: "createdAt", label: "Submitted At" },
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="jazari-submissions-${stamp}.csv"`);
  return res.status(200).send(csv);
});
