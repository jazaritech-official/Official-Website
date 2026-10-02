import { ApiError } from "./errors.js";

/**
 * Password policy shared by the team-management API and the self-service
 * change-password endpoint. Backend validation is the security boundary —
 * the frontend only mirrors these rules for UX.
 *
 * Rules: 8–200 characters, at least one lowercase letter, one uppercase
 * letter and one digit. Passwords are never logged, echoed or returned.
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export function isStrongPassword(value) {
  if (typeof value !== "string") return false;
  if (value.length < PASSWORD_MIN || value.length > PASSWORD_MAX) return false;
  return /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
}

/** Throws a field-scoped 400 when the password does not meet the policy. */
export function assertStrongPassword(value, field = "password") {
  if (!isStrongPassword(value)) {
    throw ApiError.badRequest("Some fields are invalid. Please review your input.", {
      [field]: `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters and include upper and lower case letters and a number.`,
    });
  }
}

export const PASSWORD_HINT = `At least ${PASSWORD_MIN} characters with upper and lower case letters and a number.`;
