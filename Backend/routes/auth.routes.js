import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import { loginLimiter, sensitiveLimiter } from "../middleware/rateLimiter.js";
import { requireAuth } from "../middleware/auth.js";
import { login, logout, me, changePassword } from "../controllers/authController.js";
import { PASSWORD_MAX, PASSWORD_MIN } from "../utils/password.js";

const authRouter = Router();

const loginRules = [
  body("email").trim().isEmail().withMessage("Enter a valid email address."),
  body("password").isString().isLength({ min: 1, max: 200 }).withMessage("Password is required."),
  validate,
];

const changePasswordRules = [
  body("currentPassword").isString().isLength({ min: 1, max: PASSWORD_MAX }).withMessage("Enter your current password."),
  body("newPassword")
    .isString()
    .isLength({ min: PASSWORD_MIN, max: PASSWORD_MAX })
    .withMessage(`Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`),
  validate,
];

authRouter.post("/login", loginLimiter, loginRules, login);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);
authRouter.post("/password", sensitiveLimiter, requireAuth, changePasswordRules, changePassword);

export default authRouter;
