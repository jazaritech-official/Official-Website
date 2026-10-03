import { connectDb } from "../config/db.js";
import { ApiError } from "../utils/errors.js";

/**
 * Ensure a live MongoDB connection before a route handler runs.
 *
 * This is the serverless-safe replacement for connecting the database at
 * module load: the connection is established lazily on the first request that
 * needs it, then cached and reused by every subsequent invocation (see
 * `config/db.js`). On a transient database failure it returns a clean 503 to
 * the caller instead of calling `process.exit`, so the function survives the
 * outage and recovers on the next request.
 *
 * Mounted after the public health route so `/api/health` keeps reporting DB
 * state without requiring a live database.
 */
export async function ensureDb(_req, _res, next) {
  try {
    await connectDb();
    next();
  } catch {
    next(
      new ApiError(
        503,
        "DATABASE_UNAVAILABLE",
        "The service is temporarily unable to reach its database. Please try again shortly.",
      ),
    );
  }
}

export default ensureDb;
