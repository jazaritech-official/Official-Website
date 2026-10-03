import { Router } from "express";
import { healthRouter } from "./health.routes.js";
import { ensureDb } from "../middleware/ensureDb.js";
import publicRouter from "./public.routes.js";
import authRouter from "./auth.routes.js";
import adminRouter from "./admin.routes.js";

const apiRouter = Router();

// Health stays dependency-free (it only *reports* DB state). Everything below
// lazily establishes the cached MongoDB connection — never at module load, so
// the serverless function can start before the database is reachable.
apiRouter.use("/health", healthRouter);
apiRouter.use(ensureDb);
apiRouter.use("/", publicRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/admin", adminRouter);

export default apiRouter;
