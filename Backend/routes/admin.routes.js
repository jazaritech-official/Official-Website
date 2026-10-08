import { Router } from "express";
import { body, param, query } from "express-validator";
import { requireAuth, requireRole } from "../middleware/auth.js";
import teamRouter from "./team.routes.js";
import { validate } from "../middleware/validate.js";
import {
  listAdminProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  reorderProducts,
} from "../controllers/productController.js";
import {
  listAdminLogos,
  createLogo,
  updateLogo,
  deleteLogo,
  reorderLogos,
  setLogoVisibility,
  reprocessLogo,
  revertLogo,
  bulkFixLogos,
  previewLogo,
} from "../controllers/logoController.js";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "../controllers/templateController.js";
import {
  listSubmissions,
  getSubmission,
  updateSubmissionStatus,
  deleteSubmission,
  exportSubmissions,
} from "../controllers/submissionController.js";
import { listVisitors } from "../controllers/visitorController.js";
import { getDashboardStats } from "../controllers/dashboardController.js";
import {
  listNotifications,
  getNotificationStats,
  createNotification,
  sendNotification,
  deleteNotification,
} from "../controllers/notificationController.js";

const adminRouter = Router();

// Every route below is protected by backend authentication.
// `requireAuth` re-reads role + isActive from the database on every request.
adminRouter.use(requireAuth);

// --- Team management (Super Admin only) ------------------------------------
// Mounted before the general admin routes; `requireRole` is the real gate.
adminRouter.use("/team", requireRole("super_admin"), teamRouter);

const idRules = [param("id").isMongoId().withMessage("Invalid identifier."), validate];

const productRules = [
  body("name").trim().isLength({ min: 2, max: 120 }).withMessage("Product name is required (2–120 characters)."),
  body("category").trim().isLength({ min: 2, max: 60 }).withMessage("Category is required."),
  body("productUrl").optional({ values: "falsy" }).trim().isURL({ protocols: ["http", "https"], require_tld: false }),
  body("logoId").optional({ nullable: true, values: "falsy" }).isMongoId().withMessage("Choose a valid logo."),
  body("highlightPoints").isArray({ min: 1, max: 8 }).withMessage("Add between 1 and 8 highlight points."),
  body("highlightPoints.*").trim().isLength({ min: 2, max: 170 }).withMessage("Highlight points must be 2–170 characters."),
  validate,
];

// Updates may be partial, but every provided field is still fully validated.
const productUpdateRules = [
  body("name").optional({ values: "falsy" }).trim().isLength({ min: 2, max: 120 }).withMessage("Product name is too short."),
  body("category").optional({ values: "falsy" }).trim().isLength({ min: 2, max: 60 }).withMessage("Category is too short."),
  body("productUrl").optional({ values: "falsy" }).trim().isURL({ protocols: ["http", "https"], require_tld: false }).withMessage("Enter a valid URL."),
  body("logoId").optional({ nullable: true, values: "falsy" }).isMongoId().withMessage("Choose a valid logo."),
  body("highlightPoints").optional().isArray({ min: 1, max: 8 }).withMessage("Add between 1 and 8 highlight points."),
  body("highlightPoints.*").optional().trim().isLength({ min: 2, max: 170 }).withMessage("Highlight points must be 2–170 characters."),
  validate,
];

// --- Dashboard -------------------------------------------------------------
adminRouter.get("/dashboard/stats", getDashboardStats);

// --- Logos (Cloudinary-backed upload) --------------------------------------
adminRouter.get("/logos", listAdminLogos);
adminRouter.post(
  "/logos",
  [
    body("name").trim().isLength({ min: 2, max: 120 }).withMessage("Logo name is required."),
    body("image").isString().matches(/^data:image\//).withMessage("A valid image is required."),
    body("alt").optional({ values: "falsy" }).trim().isLength({ max: 160 }),
    body("displayName").optional({ values: "falsy" }).trim().isLength({ max: 120 }),
    body("websiteUrl")
      .optional({ values: "falsy" })
      .trim()
      .isURL({ protocols: ["http", "https"], require_tld: false })
      .withMessage("Enter a valid website URL."),
    validate,
  ],
  createLogo,
);
adminRouter.put(
  "/logos/:id",
  [
    param("id").isMongoId().withMessage("Invalid identifier."),
    body("name").optional({ values: "falsy" }).trim().isLength({ min: 2, max: 120 }),
    body("alt").optional({ values: "falsy" }).trim().isLength({ max: 160 }),
    body("displayName").optional({ values: "falsy" }).trim().isLength({ max: 120 }),
    body("websiteUrl")
      .optional({ values: "falsy" })
      .trim()
      .isURL({ protocols: ["http", "https"], require_tld: false })
      .withMessage("Enter a valid website URL."),
    body("removeBackground").optional().isBoolean().toBoolean(),
    body("trim").optional().isBoolean().toBoolean(),
    body("tolerance").optional().isFloat({ min: 0, max: 100 }).toFloat(),
    validate,
  ],
  updateLogo,
);
adminRouter.delete("/logos/:id", idRules, deleteLogo);
adminRouter.patch("/logos/reorder", reorderLogos);
adminRouter.patch("/logos/:id/visibility", idRules, setLogoVisibility);

// --- Logo processing (preserve original, process, reprocess, revert, bulk) ---
const processingRules = [
  body("removeBackground").optional().isBoolean().toBoolean(),
  body("trim").optional().isBoolean().toBoolean(),
  body("tolerance").optional().isFloat({ min: 0, max: 100 }).toFloat(),
  validate,
];
adminRouter.post(
  "/logos/preview",
  [
    body("image").isString().matches(/^data:image\//).withMessage("A valid image is required."),
    body("removeBackground").optional().isBoolean().toBoolean(),
    body("trim").optional().isBoolean().toBoolean(),
    body("tolerance").optional().isFloat({ min: 0, max: 100 }).toFloat(),
    validate,
  ],
  previewLogo,
);
adminRouter.post("/logos/:id/reprocess", idRules, processingRules, reprocessLogo);
adminRouter.post("/logos/:id/revert", idRules, revertLogo);
adminRouter.post("/logos/bulk-fix", processingRules, bulkFixLogos);

// --- Products --------------------------------------------------------------
adminRouter.get("/products", listAdminProducts);
adminRouter.post("/products", productRules, createProduct);
adminRouter.get("/products/:id", idRules, getProduct);
adminRouter.put("/products/:id", idRules, productUpdateRules, updateProduct);
adminRouter.delete("/products/:id", idRules, deleteProduct);
adminRouter.patch("/products/reorder", reorderProducts);

// --- Product type templates ------------------------------------------------
adminRouter.get("/product-type-templates", listTemplates);
adminRouter.post(
  "/product-type-templates",
  [
    body("type").trim().isLength({ min: 2, max: 60 }).withMessage("Template type is required."),
    body("highlightPoints").isArray({ min: 1, max: 8 }),
    body("highlightPoints.*").trim().isLength({ min: 2, max: 170 }),
    validate,
  ],
  createTemplate,
);
adminRouter.put(
  "/product-type-templates/:id",
  [
    param("id").isMongoId().withMessage("Invalid identifier."),
    body("type").optional({ values: "falsy" }).trim().isLength({ min: 2, max: 60 }),
    body("highlightPoints").optional().isArray({ min: 1, max: 8 }),
    body("highlightPoints.*").optional().trim().isLength({ min: 2, max: 170 }),
    validate,
  ],
  updateTemplate,
);
adminRouter.delete("/product-type-templates/:id", idRules, deleteTemplate);

// --- Submissions -----------------------------------------------------------
adminRouter.get(
  "/submissions",
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("status").optional().isIn(["New", "Contacted", "Closed"]),
    validate,
  ],
  listSubmissions,
);
adminRouter.get("/submissions/export", exportSubmissions);
adminRouter.get("/submissions/:id", idRules, getSubmission);
adminRouter.patch(
  "/submissions/:id/status",
  [param("id").isMongoId(), body("status").isIn(["New", "Contacted", "Closed"]), validate],
  updateSubmissionStatus,
);
adminRouter.delete("/submissions/:id", idRules, deleteSubmission);

// --- Visitors --------------------------------------------------------------
adminRouter.get(
  "/visitors",
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    validate,
  ],
  listVisitors,
);

// --- Push notifications ----------------------------------------------------
// `stats` is declared before `/:id` so the literal path is never swallowed.
adminRouter.get("/notifications/stats", getNotificationStats);
adminRouter.get("/notifications", listNotifications);
adminRouter.post(
  "/notifications",
  [
    body("title").trim().isLength({ min: 2, max: 80 }).withMessage("A title of 2–80 characters is required."),
    body("body").trim().isLength({ min: 2, max: 200 }).withMessage("A message of 2–200 characters is required."),
    body("url").optional({ values: "falsy" }).trim().isLength({ max: 500 }),
    body("icon").optional({ values: "falsy" }).trim().isLength({ max: 500 }),
    body("tag").optional({ values: "falsy" }).trim().isLength({ max: 60 }),
    body("serviceSlug").optional({ values: "falsy" }).trim().isLength({ max: 80 }),
    body("send").optional().isBoolean().toBoolean(),
    validate,
  ],
  createNotification,
);
adminRouter.post(
  "/notifications/:id/send",
  [param("id").isMongoId().withMessage("Invalid identifier."), body("endpoint").optional({ values: "falsy" }).trim().isLength({ max: 1000 }), validate],
  sendNotification,
);
adminRouter.delete("/notifications/:id", idRules, deleteNotification);

export default adminRouter;
