import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import env from "../config/env.js";
import Admin from "../models/Admin.js";
import { sendData } from "../utils/apiResponse.js";
import { ApiError } from "../utils/errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { recordAudit } from "../utils/audit.js";
import { assertStrongPassword } from "../utils/password.js";
import { SESSION_MAX_AGE_MS, setAuthCookie, clearAuthCookie } from "../utils/authCookie.js";

function signToken(admin) {
  return jwt.sign({ sub: admin._id.toString(), role: admin.role }, env.jwt.secret, {
    expiresIn: Math.floor(SESSION_MAX_AGE_MS / 1000),
  });
}

// Comparable-work decoy so unknown emails cost the same time as real logins
// (prevents trivial account enumeration through response timing).
let decoyHashPromise = null;
function getDecoyHash() {
  if (!decoyHashPromise) decoyHashPromise = bcrypt.hash("decoy-password-value", 12);
  return decoyHashPromise;
}

/** POST /api/auth/login */
export const login = asyncHandler(async (req, res) => {
  const email = String(req.body?.email || "").toLowerCase().trim();
  const password = String(req.body?.password || "");

  const admin = await Admin.findOne({ email }).select("+passwordHash");

  if (!admin) {
    await bcrypt.compare(password, await getDecoyHash());
    throw ApiError.unauthorized("Email or password is incorrect.");
  }

  const valid = await admin.verifyPassword(password);
  if (!valid) throw ApiError.unauthorized("Email or password is incorrect.");

  // Deactivated accounts lose access immediately — even with valid credentials.
  if (admin.isActive === false) {
    throw ApiError.forbidden("This account has been deactivated. Contact a Super Admin.");
  }

  admin.lastLoginAt = new Date();
  await admin.save();

  setAuthCookie(res, signToken(admin));
  return sendData(res, { admin: admin.toPublic() });
});

/** POST /api/auth/logout */
export const logout = asyncHandler(async (_req, res) => {
  clearAuthCookie(res);
  return sendData(res, { loggedOut: true });
});

/** GET /api/auth/me — requires valid session (requireAuth). */
export const me = asyncHandler(async (req, res) => {
  // `req.admin` is hydrated from the database on every request (role + isActive
  // are always current). Never returns the password hash or any secret.
  return sendData(res, { admin: req.admin });
});

/**
 * POST /api/auth/password — self-service password change.
 * Requires the current password, validates the new one, and never returns or
 * logs either value.
 */
export const changePassword = asyncHandler(async (req, res) => {
  const currentPassword = String(req.body?.currentPassword ?? "");
  const newPassword = String(req.body?.newPassword ?? "");

  if (!currentPassword) {
    throw ApiError.badRequest("Your current password is required.", {
      currentPassword: "Enter your current password.",
    });
  }
  assertStrongPassword(newPassword, "newPassword");

  const admin = await Admin.findById(req.admin.id).select("+passwordHash");
  if (!admin) throw ApiError.unauthorized("Your account is no longer active.");

  const valid = await admin.verifyPassword(currentPassword);
  if (!valid) {
    throw ApiError.badRequest("Your current password is incorrect.", {
      currentPassword: "That password is not correct.",
    });
  }

  admin.passwordHash = await Admin.hashPassword(newPassword);
  await admin.save();

  // Re-issue the session cookie so the current device stays signed in.
  setAuthCookie(res, signToken(admin));
  recordAudit(req, "admin.password_changed", {
    target: { id: admin._id.toString(), email: admin.email },
  });
  return sendData(res, { changed: true });
});
