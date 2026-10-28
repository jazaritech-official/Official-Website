import { Router } from "express";
import { body, param } from "express-validator";
import { validate } from "../middleware/validate.js";
import { updateFinanceSettings, getTreasury } from "../controllers/financeController.js";
import { setPayout } from "../controllers/orderPaymentsController.js";

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

/** Mounted at /orders → PATCH /api/admin/orders/:id/payout. */
export const payoutRouter = Router();

payoutRouter.patch(
  "/:id/payout",
  [
    param("id").isMongoId().withMessage("Invalid identifier."),
    body("party").isIn(["referrer", "worker"]).withMessage("Choose referrer or worker."),
    body("payeeId").isMongoId().withMessage("Choose a person."),
    body("paid").optional().isBoolean().toBoolean(),
    validate,
  ],
  setPayout,
);

export default financeSuperRouter;
