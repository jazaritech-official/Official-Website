import { Router } from "express";
import { body, param } from "express-validator";
import { validate } from "../middleware/validate.js";
import { sensitiveLimiter } from "../middleware/rateLimiter.js";
import { ADMIN_ROLES } from "../models/Admin.js";
import { PASSWORD_MAX, PASSWORD_MIN } from "../utils/password.js";
import {
  listTeam,
  createAdmin,
  updateAdminRole,
  setAdminActive,
  resetAdminPassword,
  deleteAdmin,
} from "../controllers/teamController.js";

/**
 * Team management. Mounted *inside* the admin router, so `requireAuth` already
 * ran; `requireRole("super_admin")` is applied at the mount point in
 * `admin.routes.js` — this is the real security boundary.
 */
const teamRouter = Router();

const idRules = [param("id").isMongoId().withMessage("Invalid administrator identifier."), validate];

const passwordRules = [
  body("password")
    .isString()
    .isLength({ min: PASSWORD_MIN, max: PASSWORD_MAX })
    .withMessage(`Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`),
  validate,
];

const createRules = [
  body("email").trim().isEmail().withMessage("Enter a valid email address."),
  body("name").trim().isLength({ min: 2, max: 120 }).withMessage("Enter the administrator's name."),
  body("role").isIn(ADMIN_ROLES).withMessage("Choose a valid role."),
  ...passwordRules,
];

teamRouter.get("/", listTeam);

teamRouter.post("/", sensitiveLimiter, createRules, createAdmin);

teamRouter.patch(
  "/:id/role",
  sensitiveLimiter,
  [
    param("id").isMongoId().withMessage("Invalid administrator identifier."),
    body("role").isIn(ADMIN_ROLES).withMessage("Choose a valid role."),
    validate,
  ],
  updateAdminRole,
);

teamRouter.patch(
  "/:id/status",
  sensitiveLimiter,
  [
    param("id").isMongoId().withMessage("Invalid administrator identifier."),
    body("isActive").isBoolean().withMessage("Provide the activation state."),
    validate,
  ],
  setAdminActive,
);

teamRouter.post("/:id/password", sensitiveLimiter, idRules, passwordRules, resetAdminPassword);

teamRouter.delete("/:id", sensitiveLimiter, idRules, deleteAdmin);

export default teamRouter;
