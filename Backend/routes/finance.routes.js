import { Router } from "express";
import { body, param, query } from "express-validator";
import { validate } from "../middleware/validate.js";
import { ORDER_STATUSES, PAYMENT_STATUSES, MAX_ITEMS } from "../models/Order.js";
import { MAX_WORKERS } from "../utils/orderMath.js";
import {
  listClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
  listPayees,
  createPayee,
  updatePayee,
  listCatalog,
  createCatalogItem,
  updateCatalogItem,
} from "../controllers/directoryController.js";
import {
  listOrders,
  getOrderSummary,
  getOrder,
  createOrder,
  updateOrder,
  updateOrderStatus,
} from "../controllers/orderController.js";
import { recordPayment, deletePayment } from "../controllers/orderPaymentsController.js";
import { getFinanceSettings } from "../controllers/financeController.js";

/**
 * FINANCE ROUTES (part 1 of the business portal).
 *
 * Mounted by `admin.routes.js`, so `requireAuth` already applies to every route
 * below — nothing here re-implements authentication. The super-admin-only
 * endpoints live in `financeSuperRouter` (mounted behind `requireRole`), and
 * the payout route is mounted under `/orders` behind the same gate.
 *
 * Existing routes keep their exact guards: nothing in this file touches them.
 */
const financeRouter = Router();

const idRules = [param("id").isMongoId().withMessage("Invalid identifier."), validate];

const pageRules = [
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 100 }),
  query("q").optional().isLength({ max: 80 }),
  validate,
];

/* --- Clients ------------------------------------------------------------- */

const clientRules = [
  body("name").trim().isLength({ min: 2, max: 120 }).withMessage("Client name is required (2–120 characters)."),
  body("phone").optional({ values: "falsy" }).trim().isLength({ max: 40 }).withMessage("Phone is too long."),
  body("email").optional({ values: "falsy" }).trim().isEmail().withMessage("Enter a valid email address."),
  body("company").optional({ values: "falsy" }).trim().isLength({ max: 120 }),
  body("address").optional({ values: "falsy" }).trim().isLength({ max: 240 }),
  body("notes").optional({ values: "falsy" }).trim().isLength({ max: 500 }),
  body("isActive").optional().isBoolean().toBoolean(),
  validate,
];

const clientUpdateRules = [
  param("id").isMongoId().withMessage("Invalid identifier."),
  body("name").optional({ values: "falsy" }).trim().isLength({ min: 2, max: 120 }),
  body("phone").optional({ values: "falsy" }).trim().isLength({ max: 40 }),
  body("email").optional({ values: "falsy" }).trim().isEmail().withMessage("Enter a valid email address."),
  body("company").optional({ values: "falsy" }).trim().isLength({ max: 120 }),
  body("address").optional({ values: "falsy" }).trim().isLength({ max: 240 }),
  body("notes").optional({ values: "falsy" }).trim().isLength({ max: 500 }),
  body("isActive").optional().isBoolean().toBoolean(),
  validate,
];

financeRouter.get("/clients", pageRules, listClients);
financeRouter.post("/clients", clientRules, createClient);
financeRouter.get("/clients/:id", idRules, getClient);
financeRouter.put("/clients/:id", clientUpdateRules, updateClient);
financeRouter.delete("/clients/:id", idRules, deleteClient);

/* --- Workers & referrers ------------------------------------------------- */

const payeeRules = [
  body("name").trim().isLength({ min: 2, max: 120 }).withMessage("Name is required (2–120 characters)."),
  body("role").optional().isIn(["worker", "referrer", "both"]).withMessage("Choose worker, referrer or both."),
  body("phone").optional({ values: "falsy" }).trim().isLength({ max: 40 }),
  body("notes").optional({ values: "falsy" }).trim().isLength({ max: 300 }),
  body("isActive").optional().isBoolean().toBoolean(),
  validate,
];

const payeeUpdateRules = [
  param("id").isMongoId().withMessage("Invalid identifier."),
  body("name").optional({ values: "falsy" }).trim().isLength({ min: 2, max: 120 }),
  body("role").optional().isIn(["worker", "referrer", "both"]),
  body("phone").optional({ values: "falsy" }).trim().isLength({ max: 40 }),
  body("notes").optional({ values: "falsy" }).trim().isLength({ max: 300 }),
  body("isActive").optional().isBoolean().toBoolean(),
  validate,
];

financeRouter.get("/payees", pageRules, listPayees);
financeRouter.post("/payees", payeeRules, createPayee);
financeRouter.put("/payees/:id", payeeUpdateRules, updatePayee);

/* --- Order catalogue ----------------------------------------------------- */

const catalogRules = [
  body("name").trim().isLength({ min: 2, max: 120 }).withMessage("Item name is required."),
  body("unitLabel").trim().isLength({ min: 1, max: 24 }).withMessage("Unit is required (e.g. video, design)."),
  body("defaultUnitPriceMinor").optional().isInt({ min: 0 }).withMessage("Price must be zero or more."),
  body("isActive").optional().isBoolean().toBoolean(),
  body("sortOrder").optional().isInt().toInt(),
  validate,
];

const catalogUpdateRules = [
  param("id").isMongoId().withMessage("Invalid identifier."),
  body("name").optional({ values: "falsy" }).trim().isLength({ min: 2, max: 120 }),
  body("unitLabel").optional({ values: "falsy" }).trim().isLength({ min: 1, max: 24 }),
  body("defaultUnitPriceMinor").optional().isInt({ min: 0 }).toInt(),
  body("isActive").optional().isBoolean().toBoolean(),
  body("sortOrder").optional().isInt().toInt(),
  validate,
];

financeRouter.get("/order-catalog", listCatalog);
financeRouter.post("/order-catalog", catalogRules, createCatalogItem);
financeRouter.put("/order-catalog/:id", catalogUpdateRules, updateCatalogItem);

/* --- Orders -------------------------------------------------------------- */

const orderListRules = [
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 100 }),
  query("status").optional().isIn(ORDER_STATUSES),
  query("paymentStatus").optional().isIn(PAYMENT_STATUSES),
  query("q").optional().isLength({ max: 80 }),
  query("clientId").optional().isLength({ max: 40 }),
  query("from").optional().isLength({ max: 40 }),
  query("to").optional().isLength({ max: 40 }),
  validate,
];

const splitRules = [
  body("split").optional().isObject(),
  body("split.referrer.payeeId").optional({ nullable: true, values: "falsy" }).isMongoId(),
  body("split.referrer.bp").optional().isInt({ min: 0, max: 10000 }).withMessage("Percentages run 0–100%."),
  body("split.workers").optional().isArray({ max: MAX_WORKERS }),
  body("split.workers.*.payeeId").optional({ nullable: true, values: "falsy" }).isMongoId(),
  body("split.workers.*.bp").optional().isInt({ min: 0, max: 10000 }).withMessage("Percentages run 0–100%."),
];

/** Items are mandatory on create and optional (partial update) on PUT. */
function itemsRules(required) {
  const opt = (rule) => (required ? rule : rule.optional({ values: "falsy" }));
  return [
    opt(body("items")).isArray({ min: 1, max: MAX_ITEMS }).withMessage("Add between 1 and 14 items."),
    opt(body("items.*.name")).trim().isLength({ min: 1, max: 120 }).withMessage("Every item needs a name."),
    body("items.*.unitLabel").optional({ values: "falsy" }).trim().isLength({ max: 24 }),
    opt(body("items.*.quantity")).isInt({ min: 1, max: 100000 }).withMessage("Quantity must be at least 1."),
    opt(body("items.*.unitPriceMinor")).isInt({ min: 0 }).withMessage("Enter a valid unit price."),
    body("items.*.lineTotalMinor").optional().isInt({ min: 0 }),
    body("items.*.catalogItemId").optional({ nullable: true, values: "falsy" }).isMongoId(),
  ];
}

const initialPaymentRules = [
  body("initialPayment").optional({ values: "falsy" }).isObject(),
  body("initialPayment.amountMinor").optional().isInt({ min: 1 }),
  body("initialPayment.method").optional({ values: "falsy" }).trim().isLength({ max: 40 }),
  body("initialPayment.receivedAt").optional({ nullable: true, values: "falsy" }).isISO8601(),
  body("initialPayment.reference").optional({ values: "falsy" }).trim().isLength({ max: 120 }),
  body("initialPayment.note").optional({ values: "falsy" }).trim().isLength({ max: 300 }),
];

/** Shared between create and update (create adds clientId + initial payment). */
const commonOrderRules = [
  body("title").optional({ values: "falsy" }).trim().isLength({ max: 160 }),
  body("notes").optional({ values: "falsy" }).trim().isLength({ max: 1000 }),
  body("deliveryDate").optional({ nullable: true, values: "falsy" }).isISO8601().withMessage("Enter a valid date."),
  body("discountMinor").optional().isInt({ min: 0 }).toInt(),
  body("status").optional().isIn(ORDER_STATUSES),
];

const orderRules = [
  body("clientId").isMongoId().withMessage("Choose a client."),
  ...commonOrderRules,
  ...itemsRules(true),
  ...initialPaymentRules,
  ...splitRules,
  validate,
];

const orderUpdateRules = [
  param("id").isMongoId().withMessage("Invalid identifier."),
  ...commonOrderRules,
  ...itemsRules(false),
  ...splitRules,
  validate,
];

const statusRules = [
  param("id").isMongoId().withMessage("Invalid identifier."),
  body("status").isIn(ORDER_STATUSES).withMessage("Choose a valid status."),
  body("allowUnpaidComplete").optional().isBoolean().toBoolean(),
  body("note").optional({ values: "falsy" }).trim().isLength({ max: 200 }),
  validate,
];

const paymentRules = [
  param("id").isMongoId().withMessage("Invalid identifier."),
  body("amountMinor").isInt({ min: 1 }).withMessage("Enter an amount greater than zero."),
  body("method").trim().isLength({ min: 1, max: 40 }).withMessage("Choose a payment method."),
  body("receivedAt").optional({ nullable: true, values: "falsy" }).isISO8601().withMessage("Enter a valid date."),
  body("reference").optional({ values: "falsy" }).trim().isLength({ max: 120 }),
  body("note").optional({ values: "falsy" }).trim().isLength({ max: 300 }),
  validate,
];

const paymentDeleteRules = [
  param("id").isMongoId().withMessage("Invalid identifier."),
  param("paymentId").isMongoId().withMessage("Invalid payment."),
  validate,
];

financeRouter.get("/orders/summary", getOrderSummary);
financeRouter.get("/orders", orderListRules, listOrders);
financeRouter.post("/orders", orderRules, createOrder);
financeRouter.get("/orders/:id", idRules, getOrder);
financeRouter.put("/orders/:id", orderUpdateRules, updateOrder);
financeRouter.patch("/orders/:id/status", statusRules, updateOrderStatus);
financeRouter.post("/orders/:id/payments", paymentRules, recordPayment);
financeRouter.delete("/orders/:id/payments/:paymentId", paymentDeleteRules, deletePayment);

/* --- Settings readable by every admin (the order form and the bill need it) */

financeRouter.get("/finance/settings", getFinanceSettings);

export default financeRouter;
