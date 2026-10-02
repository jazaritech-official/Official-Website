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
 * Backend-side authorization for every /api/admin/* route.
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

    req.admin = { id: admin._id.toString(), email: admin.email, role: admin.role };
    return next();
  } catch (error) {
    return next(error);
  }
}

export default requireAuth;
