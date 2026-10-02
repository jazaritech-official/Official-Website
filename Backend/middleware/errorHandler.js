import env from "../config/env.js";
import { sendError } from "../utils/apiResponse.js";
import { ApiError } from "../utils/errors.js";

/** Translate known library errors into safe, public-facing API errors. */
function normalizeError(error) {
  if (error instanceof ApiError) return error;

  // Malformed JSON body.
  if (error?.type === "entity.parse.failed" || (error instanceof SyntaxError && error.status === 400)) {
    return ApiError.badRequest("Request body contains invalid JSON.");
  }

  // Body too large.
  if (error?.type === "entity.too.large") {
    return new ApiError(413, "PAYLOAD_TOO_LARGE", "Uploaded file is too large.");
  }

  // Mongoose schema validation.
  if (error?.name === "ValidationError" && error.errors) {
    const details = Object.fromEntries(
      Object.values(error.errors).map((field) => [field.path, field.message]),
    );
    return ApiError.badRequest("Some fields are invalid. Please review your input.", details);
  }

  // Mongoose bad ObjectId / malformed id.
  if (error?.name === "CastError") {
    return ApiError.badRequest("The provided identifier is not valid.");
  }

  // Mongo duplicate key.
  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern || error.keyValue || {})[0] || "field";
    return ApiError.conflict(`A record with this ${field} already exists.`);
  }

  return error;
}

/** 404 for unmatched API routes. */
export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`No API route matches ${req.method} ${req.originalUrl}`));
}

/**
 * Centralized error middleware — the only place that formats error JSON.
 * Internal details (stack traces, Mongo/JWT internals) are never exposed.
 */
export function errorHandler(error, req, res, _next) {
  const normalized = normalizeError(error);
  const status = normalized.status || normalized.statusCode || 500;
  const isServerError = status >= 500;

  if (isServerError) {
    console.error(`[error] ${req.method} ${req.originalUrl} -> ${status}`);
    console.error(normalized.stack || normalized.message);
  }

  if (res.headersSent) return;

  const code = normalized.code || (isServerError ? "INTERNAL_ERROR" : "BAD_REQUEST");
  const message =
    isServerError && env.isProd
      ? "Something went wrong on our end. Please try again."
      : normalized.message || "Unexpected error.";

  sendError(res, status, code, message, normalized.details);
}

export default errorHandler;
