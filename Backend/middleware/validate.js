import { validationResult } from "express-validator";
import { ApiError } from "../utils/errors.js";

/**
 * Runs express-validator rules and converts failures into the shared error
 * contract with per-field details (frontend uses these for inline messages).
 *
 * Backend validation is security; frontend validation is only UX.
 */
export function validate(req, _res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = {};
  for (const issue of result.array()) {
    const field = issue.path || issue.param || "form";
    if (!details[field]) details[field] = issue.msg;
  }

  return next(ApiError.badRequest("Some fields are invalid. Please review your input.", details));
}

export default validate;
