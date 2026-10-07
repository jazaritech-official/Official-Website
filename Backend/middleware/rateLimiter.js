import rateLimit from "express-rate-limit";
import env from "../config/env.js";
import { sendError } from "../utils/apiResponse.js";

/**
 * Rate limiters. The general limiter guards the whole API; stricter limiters
 * are applied to login, form submission and visitor tracking.
 */
function buildLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // Keep responses inside the shared JSON contract.
    handler: (_req, res) => {
      sendError(res, 429, "RATE_LIMITED", message);
    },
  });
}

export const generalLimiter = buildLimiter({
  windowMs: env.rateLimits.generalWindowMs,
  max: env.rateLimits.generalMax,
  message: "Too many requests from this network. Please try again in a few minutes.",
});

export const loginLimiter = buildLimiter({
  windowMs: env.rateLimits.generalWindowMs,
  max: env.rateLimits.loginMax,
  message: "Too many login attempts. Please wait a few minutes before trying again.",
});

export const submissionLimiter = buildLimiter({
  windowMs: env.rateLimits.generalWindowMs,
  max: env.rateLimits.submissionMax,
  message: "You have submitted several requests already. Please wait a few minutes.",
});

export const visitorLimiter = buildLimiter({
  windowMs: env.rateLimits.generalWindowMs,
  max: env.rateLimits.visitorMax,
  message: "Too many tracking events. Please try again later.",
});

// Push subscription register/unregister beacons.
export const pushLimiter = buildLimiter({
  windowMs: env.rateLimits.generalWindowMs,
  max: env.rateLimits.pushMax,
  message: "Too many notification requests. Please try again later.",
});

// Team management and password changes — sensitive write operations.
export const sensitiveLimiter = buildLimiter({
  windowMs: env.rateLimits.generalWindowMs,
  max: env.rateLimits.sensitiveMax,
  message: "Too many security operations. Please wait a few minutes and try again.",
});
