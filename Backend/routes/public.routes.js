import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import { pushLimiter, submissionLimiter, visitorLimiter } from "../middleware/rateLimiter.js";
import { listPublicLogos } from "../controllers/logoController.js";
import { listPublicProducts } from "../controllers/productController.js";
import { listPublicServices } from "../controllers/serviceController.js";
import { createSubmission } from "../controllers/submissionController.js";
import { trackVisitor } from "../controllers/visitorController.js";
import { getPushKey, subscribe, unsubscribe } from "../controllers/pushController.js";

const publicRouter = Router();

const PHONE_RE = /^\+?[0-9][0-9\s\-().]{6,19}$/;

// --- Content ---------------------------------------------------------------
publicRouter.get("/logos", listPublicLogos);
publicRouter.get("/products", listPublicProducts);
publicRouter.get("/services", listPublicServices);

// --- Start Your Project intake --------------------------------------------
const submissionRules = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage("Please enter your name (2–120 characters)."),
  body("domain").optional({ values: "falsy" }).trim().isLength({ max: 200 }).withMessage("Domain is too long."),
  body("email").optional({ values: "falsy" }).trim().isEmail().withMessage("Please enter a valid email address."),
  body("phone")
    .optional({ values: "falsy" })
    .trim()
    .matches(PHONE_RE)
    .withMessage("Please enter a valid phone number."),
  body("service")
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage("Please choose the service you need."),
  // Business rule: at least one contact channel.
  body()
    .custom((value) => {
      const phone = String(value?.phone || "").trim();
      const email = String(value?.email || "").trim();
      if (!phone && !email) throw new Error("Provide at least a phone number or an email address.");
      return true;
    }),
  validate,
];

publicRouter.post("/submission", submissionLimiter, submissionRules, createSubmission);

// --- Visitor analytics -----------------------------------------------------
const visitorRules = [
  body("page").optional({ values: "falsy" }).trim().isLength({ max: 500 }),
  body("referrer").optional({ values: "falsy" }).trim().isLength({ max: 500 }),
  validate,
];

publicRouter.post("/visitor-track", visitorLimiter, visitorRules, trackVisitor);

// --- Push notifications (Web Push) ----------------------------------------
// The public key is safe to expose; the subscribe/unsubscribe beacons are
// rate-limited but otherwise public (they store no personal data).
publicRouter.get("/push/public-key", getPushKey);

const subscriptionRules = [
  body("endpoint")
    .isString()
    .trim()
    .isLength({ min: 10, max: 1000 })
    .matches(/^https:\/\//)
    .withMessage("A valid push endpoint is required."),
  body("keys.p256dh").isString().trim().isLength({ min: 10, max: 400 }).withMessage("A valid p256dh key is required."),
  body("keys.auth").isString().trim().isLength({ min: 6, max: 400 }).withMessage("A valid auth key is required."),
  body("page").optional({ values: "falsy" }).trim().isLength({ max: 500 }),
  validate,
];

publicRouter.post("/push/subscribe", pushLimiter, subscriptionRules, subscribe);
publicRouter.post(
  "/push/unsubscribe",
  pushLimiter,
  [body("endpoint").isString().trim().isLength({ min: 10, max: 1000 }), validate],
  unsubscribe,
);

export default publicRouter;
