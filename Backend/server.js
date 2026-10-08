import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import env from "./config/env.js";
import { connectDb } from "./config/db.js";
import apiRouter from "./routes/index.js";
import { generalLimiter } from "./middleware/rateLimiter.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import { storageDriver, LOCAL_UPLOAD_DIR } from "./services/storageService.js";

const app = express();

// --- Reverse proxy / client IP ------------------------------------------------
// Trust exactly `TRUST_PROXY` hop(s) so X-Forwarded-For is honoured behind a
// proxy without blindly trusting arbitrary client-supplied headers.
app.set("trust proxy", env.trustProxy);

// --- Security & parsing middleware -------------------------------------------
app.disable("x-powered-by");
app.use(
  helmet({
    // The API serves JSON only; keep the default cross-origin resource policy
    // strict but allow same-site embedding of public assets.
    crossOriginResourcePolicy: { policy: "same-site" },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser tools (curl, server-to-server) and configured origins only.
      if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  }),
);
app.use(compression());
if (!env.isTest) app.use(morgan(env.logFormat));
app.use(express.json({ limit: env.jsonBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
// --- Routes -------------------------------------------------------------------
app.use("/api", generalLimiter, apiRouter);

// Local development storage driver serves uploaded assets from disk.
if (storageDriver === "local") {
  app.use(
    "/api/uploads",
    express.static(LOCAL_UPLOAD_DIR, {
      index: false,
      dotfiles: "deny",
      maxAge: "1d",
    }),
  );
}

// --- Errors -------------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

// --- Vercel -------------------------------------------------------------------
// Export the fully-configured app so Vercel's Express preset detects it as the
// single serverless handler (see Backend/vercel.json). No behavior change: the
// local `start()` below still connects the DB and listens on a port.
export default app;

// --- Startup ------------------------------------------------------------------
async function start() {
  try {
    await connectDb();
  } catch (error) {
    console.error(`[server] refusing to start without database access: ${error.message}`);
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    console.log(`[server] Jazari Tech API listening on http://localhost:${env.port}`);
    console.log(`[server] allowed origin: ${env.clientOrigins.join(", ")}`);
    console.log(`[server] storage driver: ${storageDriver}`);
  });

  const shutdown = (signal) => {
    console.log(`[server] received ${signal}, shutting down…`);
    server.close(() => {
      import("mongoose").then(({ default: mongoose }) => mongoose.disconnect()).finally(() => process.exit(0));
    });
    // Hard exit if connections refuse to drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// Local / traditional hosting keeps the previous behaviour: connect the DB and
// listen on a port. On Vercel the platform owns the listening socket and
// imports the exported app instead, so `start()` must NOT run at module load
// (it would connect eagerly on cold start and `process.exit` on a transient DB
// outage). Serverless requests connect lazily via `middleware/ensureDb.js`.
if (!process.env.VERCEL) {
  start();
}
