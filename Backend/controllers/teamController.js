import Admin, { ADMIN_ROLES, SUPER_ADMIN } from "../models/Admin.js";
import { sendData } from "../utils/apiResponse.js";
import { ApiError } from "../utils/errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { recordAudit } from "../utils/audit.js";
import { assertStrongPassword } from "../utils/password.js";

/**
 * Team management — every route here is gated by `requireRole("super_admin")`.
 *
 * Safety rules enforced server-side (never rely on the frontend guard):
 *  - a Super Admin cannot demote, deactivate or delete themselves;
 *  - the last active Super Admin can never be demoted, deactivated or deleted;
 *  - passwords are never returned, logged or audited.
 */

const normalizeEmail = (value) => String(value ?? "").toLowerCase().trim();

/** Safe list projection — id/email/name/role/isActive + timestamps. */
function toAdminSummary(doc) {
  return {
    id: doc._id.toString(),
    email: doc.email,
    name: doc.name || "",
    role: doc.role,
    isActive: doc.isActive !== false,
    lastLoginAt: doc.lastLoginAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Blocks removing the final active Super Admin. Throws a 403 otherwise.
 * `verb` is used only for the safe message ("demoted" / "deactivated" / "deleted").
 */
async function assertSuperAdminRemains(target, verb) {
  if (target.role !== SUPER_ADMIN) return;
  const remaining = await Admin.countDocuments({
    _id: { $ne: target._id },
    role: SUPER_ADMIN,
    isActive: true,
  });
  if (remaining === 0) {
    throw ApiError.forbidden(`The last active Super Admin cannot be ${verb}.`);
  }
}

async function findTarget(id) {
  const target = await Admin.findById(id);
  if (!target) throw ApiError.notFound("That administrator no longer exists.");
  return target;
}

/** GET /api/admin/team */
export const listTeam = asyncHandler(async (_req, res) => {
  const admins = await Admin.find().sort({ createdAt: 1 });
  return sendData(res, { admins: admins.map(toAdminSummary) });
});

/** POST /api/admin/team — create an administrator. */
export const createAdmin = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const name = String(req.body?.name ?? "").trim();
  const role = String(req.body?.role ?? "admin");
  const password = String(req.body?.password ?? "");

  if (!ADMIN_ROLES.includes(role)) {
    throw ApiError.badRequest("Unsupported admin role.", { role: "Choose a valid role." });
  }
  assertStrongPassword(password);

  const existing = await Admin.findOne({ email }).lean();
  if (existing) throw ApiError.conflict("An administrator with that email already exists.");

  const created = await Admin.create({
    email,
    name,
    role,
    isActive: true,
    passwordHash: await Admin.hashPassword(password),
  });

  recordAudit(req, "admin.created", { target: created, metadata: { role } });
  return sendData(res, { admin: toAdminSummary(created) }, 201);
});

/** PATCH /api/admin/team/:id/role */
export const updateAdminRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const role = String(req.body?.role ?? "");
  if (!ADMIN_ROLES.includes(role)) {
    throw ApiError.badRequest("Unsupported admin role.", { role: "Choose a valid role." });
  }
  if (id === req.admin.id) {
    throw ApiError.forbidden("You cannot change your own role.");
  }

  const target = await findTarget(id);
  const previousRole = target.role;

  // Demotion or promotion of a Super Admin must never orphan the system.
  if (previousRole === SUPER_ADMIN && role !== SUPER_ADMIN) {
    await assertSuperAdminRemains(target, "demoted");
  }

  target.role = role;
  await target.save();

  recordAudit(req, "admin.role_changed", {
    target,
    metadata: { from: previousRole, to: role },
  });
  return sendData(res, { admin: toAdminSummary(target) });
});

/** PATCH /api/admin/team/:id/status — activate / deactivate. */
export const setAdminActive = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const isActive = req.body?.isActive;

  if (typeof isActive !== "boolean") {
    throw ApiError.badRequest("Provide the activation state.", { isActive: "Must be true or false." });
  }
  if (id === req.admin.id && isActive === false) {
    throw ApiError.forbidden("You cannot deactivate your own account.");
  }

  const target = await findTarget(id);
  if (target.isActive === isActive) {
    return sendData(res, { admin: toAdminSummary(target) });
  }

  if (isActive === false) {
    await assertSuperAdminRemains(target, "deactivated");
  }

  target.isActive = isActive;
  await target.save();

  recordAudit(req, isActive ? "admin.activated" : "admin.deactivated", { target });
  return sendData(res, { admin: toAdminSummary(target) });
});

/** POST /api/admin/team/:id/password — reset another admin's password. */
export const resetAdminPassword = asyncHandler(async (req, res) => {
  const password = String(req.body?.password ?? "");
  assertStrongPassword(password);

  const target = await findTarget(req.params.id);
  target.passwordHash = await Admin.hashPassword(password);
  await target.save();

  // Never record or return the password itself.
  recordAudit(req, "admin.password_reset", { target });
  return sendData(res, { admin: toAdminSummary(target), reset: true });
});

/** DELETE /api/admin/team/:id */
export const deleteAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (id === req.admin.id) {
    throw ApiError.forbidden("You cannot delete your own account.");
  }

  const target = await findTarget(id);
  await assertSuperAdminRemains(target, "deleted");

  await target.deleteOne();

  recordAudit(req, "admin.deleted", {
    target,
    metadata: { role: target.role },
  });
  return sendData(res, { id, deleted: true });
});

export default {
  listTeam,
  createAdmin,
  updateAdminRole,
  setAdminActive,
  resetAdminPassword,
  deleteAdmin,
};
