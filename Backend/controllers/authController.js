import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import env from "../config/env.js";
import Admin from "../models/Admin.js";
import { sendData } from "../utils/apiResponse.js";
import { ApiError } from "../utils/errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/** Decode simple duration strings like "7d", "12h", "30m" or seconds. */
function parseDurationMs(value, fallbackMs) {
  const match = /^(\d+)\s*(s|m|h|d)?$/i.exec(String(value).trim());
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = (match[2] || "s").toLowerCase();
  const factors = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * factors[unit];
}

const sessionMaxAge = parseDurationMs(env.jwt.expiresIn, 7 * 86_400_000);

function signToken(admin) {
  return jwt.sign({ sub: admin._id.toString(), role: admin.role }, env.jwt.secret, {
    expiresIn: Math.floor(sessionMaxAge / 1000),
  });
}

function setAuthCookie(res, token) {
  res.cookie(env.jwt.cookieName, token, {
    httpOnly: true,
    secure: env.jwt.cookieSecure,
    sameSite: env.jwt.cookieSameSite,
    maxAge: sessionMaxAge,
    path: "/",
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

  admin.lastLoginAt = new Date();
  await admin.save();

  setAuthCookie(res, signToken(admin));
  return sendData(res, { admin: admin.toPublic() });
});

/** POST /api/auth/logout */
export const logout = asyncHandler(async (_req, res) => {
  res.clearCookie(env.jwt.cookieName, {
    httpOnly: true,
    secure: env.jwt.cookieSecure,
    sameSite: env.jwt.cookieSameSite,
    path: "/",
  });
  return sendData(res, { loggedOut: true });
});

/** GET /api/auth/me — requires valid session (requireAuth). */
export const me = asyncHandler(async (req, res) => sendData(res, { admin: req.admin }));
