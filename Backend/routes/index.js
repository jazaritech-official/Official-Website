import { Router } from "express";
import { healthRouter } from "./health.routes.js";
import publicRouter from "./public.routes.js";
import authRouter from "./auth.routes.js";
import adminRouter from "./admin.routes.js";

const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/", publicRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/admin", adminRouter);

export default apiRouter;
