import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import { loginLimiter } from "../middleware/rateLimiter.js";
import { requireAuth } from "../middleware/auth.js";
import { login, logout, me } from "../controllers/authController.js";

const authRouter = Router();

const loginRules = [
  body("email").trim().isEmail().withMessage("Enter a valid email address."),
  body("password").isString().isLength({ min: 1, max: 200 }).withMessage("Password is required."),
  validate,
];

authRouter.post("/login", loginLimiter, loginRules, login);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);

export default authRouter;
