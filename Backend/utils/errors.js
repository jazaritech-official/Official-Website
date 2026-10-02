/**
 * Minimal error type used across controllers and middleware.
 * The centralized error handler turns these into the public JSON contract:
 *   { success: false, error: { code, message } }
 */
export class ApiError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} code stable machine-readable error code
   * @param {string} message safe, user-facing message
   * @param {unknown} [details] optional field-level details (never internal data)
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }

  static badRequest(message = "Invalid request.", details) {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message = "Authentication required.") {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "You do not have access to this resource.") {
    return new ApiError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Resource not found.") {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static conflict(message = "Resource already exists.") {
    return new ApiError(409, "CONFLICT", message);
  }

  static tooMany(message = "Too many requests. Please try again shortly.") {
    return new ApiError(429, "RATE_LIMITED", message);
  }

  static internal(message = "Something went wrong on our end. Please try again.") {
    return new ApiError(500, "INTERNAL_ERROR", message);
  }
}

export default ApiError;
