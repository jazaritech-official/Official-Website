import { Router } from "express";
import { body, param } from "express-validator";
import { validate } from "../middleware/validate.js";
import { updateFinanceSettings, getTreasury } from "../controllers/financeController.js";
import { setPayout } from "../controllers/orderPaymentsController.js";
import { recalculateSplit } from "../controllers/orderController.js";
import { MAX_SPLIT_ENTRIES } from "../utils/splitTemplate.js";

/**
 * SUPER-ADMIN-ONLY finance routes.
 *
 * Both routers are mounted in `admin.routes.js` behind
 * `requireRole("super_admin")`, exactly like `/team`:
 *
 *   adminRouter.use("/finance", requireRole("super_admin"), financeSuperRouter);
 *   adminRouter.use("/orders", requireRole("super_admin"), payoutRouter);
 *
 * `requireAuth` has already run for the whole admin router, so the only thing
 * these gate is the ROLE — the same boundary the rest of the portal uses.
 */
export const financeSuperRouter = Router();

const settingsRules = [
  body("referrerBp").optional().isInt({ min: 0, max: 10000 }).withMessage("Referrer share must be 0–100%."),
  body("workerBp").optional().isInt({ min: 0, max: 10000 }).withMessage("Worker share must be 0–100%."),
  // The SPLIT TEMPLATE — shapes are validated here, the exact 100% rule is
  // enforced in utils/splitTemplate.js so the error can point at the field.
  body("splitTemplate").optional().isObject(),
  body("splitTemplate.entries").optional().isArray({ min: 1, max: MAX_SPLIT_ENTRIES }).withMessage("Add between 1 and 6 shares."),
  body("splitTemplate.entries.*.ownerId").isMongoId().withMessage("Choose an owner."),
  body("splitTemplate.entries.*.bp").isInt({ min: 0, max: 10000 }).withMessage("Each share must be 0–100%."),
  body("splitTemplate.entries.*.role").optional({ values: "falsy" }).trim().isLength({ max: 60 }),
  body("splitTemplate.companyReserveBp").optional().isInt({ min: 0, max: 10000 }).withMessage("Reserve must be 0–100%."),
  body("splitTemplate.roundTo100").optional().isBoolean().toBoolean(),
  body("currency").optional({ values: "falsy" }).trim().isLength({ min: 3, max: 8 }),
  body("paymentMethods").optional().isArray({ min: 1, max: 20 }).withMessage("Keep 1–20 payment methods."),
  body("paymentMethods.*").trim().isLength({ min: 1, max: 40 }),
  body("business.businessName").optional({ values: "falsy" }).trim().isLength({ max: 120 }),
  body("business.address").optional({ values: "falsy" }).trim().isLength({ max: 240 }),
  body("business.phone").optional({ values: "falsy" }).trim().isLength({ max: 40 }),
  body("business.email").optional({ values: "falsy" }).trim().isLength({ max: 120 }),
  body("business.website").optional({ values: "falsy" }).trim().isLength({ max: 160 }),
  body("business.paymentInstructions").optional({ values: "falsy" }).trim().isLength({ max: 1200 }),
  body("business.billFooterNote").optional({ values: "falsy" }).trim().isLength({ max: 240 }),
  validate,
];

// Mounted at /finance → these are PUT /api/admin/finance/settings and
// GET /api/admin/finance/treasury.
financeSuperRouter.put("/settings", settingsRules, updateFinanceSettings);
financeSuperRouter.get("/treasury", getTreasury);

/** Mounted at /orders → PATCH /api/admin/orders/:id/payout + …/split/recalculate. */
export const payoutRouter = Router();

payoutRouter.patch(
  "/:id/payout",
  [
    param("id").isMongoId().withMessage("Invalid identifier."),
    body("party").isIn(["referrer", "worker", "owner"]).withMessage("Choose referrer, worker or owner."),
    body("payeeId").isMongoId().withMessage("Choose a person."),
    body("paid").optional().isBoolean().toBoolean(),
    validate,
  ],
  setPayout,
);

payoutRouter.patch("/:id/split/recalculate", [param("id").isMongoId().withMessage("Invalid identifier."), validate], recalculateSplit);

export default financeSuperRouter;
