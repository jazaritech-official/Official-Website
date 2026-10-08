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
/**
 * Opt-in internal diagnostic header.
 *
 * When `AUTH_DEBUG_HEADERS=true`, a failed-auth response carries
 * `X-Auth-Reason: no-token | invalid-token | no-admin | inactive` so a deployed
 * sign-in problem can be located exactly ("cookie never arrived" vs "token
 * rejected" vs "account gone") without guessing. OFF by default; it carries an
 * enum only — never a token, a claim, an email or any value — and the public
 * response body is unchanged. Never an authorization input.
 */
function markAuthReason(res, reason) {
  if (!env.authDebugHeaders) return;
  if (res && typeof res.setHeader === "function" && !res.headersSent) {
    res.setHeader("X-Auth-Reason", reason);
  }
}

export async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      markAuthReason(res, "no-token");
      throw ApiError.unauthorized("Please sign in to continue.");
    }

    let payload;
    try {
      payload = jwt.verify(token, env.jwt.secret);
    } catch {
      markAuthReason(res, "invalid-token");
      throw ApiError.unauthorized("Your session has expired. Please sign in again.");
    }

    const admin = await Admin.findById(payload.sub).lean();
    if (!admin) {
      markAuthReason(res, "no-admin");
      throw ApiError.unauthorized("Your account is no longer active.");
    }
    if (admin.isActive === false) {
      markAuthReason(res, "inactive");
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
