import { Router } from "express";
import { body, param, query } from "express-validator";
import { requireAuth } from "../middleware/auth.js";
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

const adminRouter = Router();

// Every route below is protected by backend authentication.
adminRouter.use(requireAuth);

const idRules = [param("id").isMongoId().withMessage("Invalid identifier."), validate];

const productRules = [
  body("name").trim().isLength({ min: 2, max: 120 }).withMessage("Product name is required (2–120 characters)."),
  body("category").trim().isLength({ min: 2, max: 60 }).withMessage("Category is required."),
  body("productUrl").optional({ values: "falsy" }).trim().isURL({ protocols: ["http", "https"], require_tld: false }),
  body("highlightPoints").isArray({ min: 1, max: 8 }).withMessage("Add between 1 and 8 highlight points."),
  body("highlightPoints.*").trim().isLength({ min: 2, max: 170 }).withMessage("Highlight points must be 2–170 characters."),
  validate,
];

// Updates may be partial, but every provided field is still fully validated.
const productUpdateRules = [
  body("name").optional({ values: "falsy" }).trim().isLength({ min: 2, max: 120 }).withMessage("Product name is too short."),
  body("category").optional({ values: "falsy" }).trim().isLength({ min: 2, max: 60 }).withMessage("Category is too short."),
  body("productUrl").optional({ values: "falsy" }).trim().isURL({ protocols: ["http", "https"], require_tld: false }).withMessage("Enter a valid URL."),
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
    validate,
  ],
  createLogo,
);
adminRouter.put("/logos/:id", idRules, updateLogo);
adminRouter.delete("/logos/:id", idRules, deleteLogo);
adminRouter.patch("/logos/reorder", reorderLogos);
adminRouter.patch("/logos/:id/visibility", idRules, setLogoVisibility);

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

export default adminRouter;
