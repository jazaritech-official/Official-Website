import mongoose from "mongoose";
import { Router } from "express";
import env from "../config/env.js";
import { sendData } from "../utils/apiResponse.js";

export const healthRouter = Router();

/** GET /api/health — liveness + MongoDB readiness for ops dashboards. */
healthRouter.get("/", (_req, res) => {
  const dbStates = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };
  const dbState = dbStates[mongoose.connection.readyState] || "unknown";

  sendData(res, {
    status: "ok",
    uptime: Math.round(process.uptime()),
    environment: env.nodeEnv,
    database: dbState,
    timestamp: new Date().toISOString(),
  });
});
