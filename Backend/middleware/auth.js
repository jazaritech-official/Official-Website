import jwt from "jsonwebtoken";
import env from "../config/env.js";
import { ApiError } from "../utils/errors.js";
import Admin from "../models/Admin.js";

function extractToken(req) {
  const cookieToken = req.cookies?.[env.jwt.cookieName];
  if (cookieToken) return cookieToken;

  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

/**
 * Backend-side authentication + live authorization for every /api/admin/* route.
 *
 * The JWT carries the role for convenience, but authorization is NEVER taken
 * from the token: the Admin document is re-read from the database on every
 * request, so demotions, deactivations and deletions take effect immediately.
 * The admin UI route being hidden is never treated as protection.
 */
export async function requireAuth(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw ApiError.unauthorized("Please sign in to continue.");

    let payload;
    try {
      payload = jwt.verify(token, env.jwt.secret);
    } catch {
      throw ApiError.unauthorized("Your session has expired. Please sign in again.");
    }

    const admin = await Admin.findById(payload.sub).lean();
    if (!admin) throw ApiError.unauthorized("Your account is no longer active.");
    if (admin.isActive === false) {
      throw ApiError.forbidden("This account has been deactivated. Contact a Super Admin.");
    }

    req.admin = {
      id: admin._id.toString(),
      email: admin.email,
      name: admin.name || "",
      role: admin.role,
      isActive: admin.isActive !== false,
      lastLoginAt: admin.lastLoginAt ?? null,
      createdAt: admin.createdAt,
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Reusable role gate. Must run AFTER `requireAuth` (which hydrates `req.admin`
 * from the database). Centralizes the authorization rule so controllers never
 * duplicate it.
 *
 *   router.use(requireRole("super_admin"));
 */
export function requireRole(...roles) {
  const allowed = new Set(roles);
  return (req, _res, next) => {
    if (!req.admin) return next(ApiError.unauthorized("Please sign in to continue."));
    if (!allowed.has(req.admin.role)) {
      return next(ApiError.forbidden("You do not have access to this resource."));
    }
    return next();
  };
}

export default requireAuth;
