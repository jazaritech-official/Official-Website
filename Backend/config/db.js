import mongoose from "mongoose";
import env from "./env.js";

mongoose.set("strictQuery", true);

// Reuse a single connection attempt across requests, hot reloads and serverless
// invocations. A per-process module variable would be reset whenever Node
// re-evaluates the module, so the in-flight promise is kept on `globalThis`
// (the pattern Vercel recommends for serverless databases). No new connection
// is ever opened while one exists, and concurrent callers always share the
// same promise.
const globalForDb = globalThis;
if (!globalForDb.__jazariDb) {
  globalForDb.__jazariDb = { promise: null };
}
const dbCache = globalForDb.__jazariDb;

/**
 * Connect to MongoDB (idempotent).
 *
 * Safe to call many times, concurrently and from serverless handlers:
 *  - returns immediately when mongoose already reports a live connection;
 *  - shares one in-flight promise for concurrent callers;
 *  - never opens a second connection while one is being established.
 *
 * Failures reject (and clear the cache so the next request may retry) — they
 * never call process.exit, so a transient database outage cannot kill the
 * serverless function.
 *
 * @returns {Promise<import("mongoose").Connection>}
 */
export function connectDb(uri = env.mongoUri) {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose.connection);
  }
  if (dbCache.promise) return dbCache.promise;

  dbCache.promise = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 10_000,
      autoIndex: !env.isProd,
      // Bounded pools keep serverless concurrency from exhausting Atlas
      // connection limits while still allowing parallel queries.
      maxPoolSize: env.isProd ? 10 : 5,
    })
    .then((mongooseInstance) => {
      dbCache.promise = null;
      if (mongooseInstance.connection.readyState === 1) {
        console.log("[db] connected");
      }
      return mongooseInstance.connection;
    })
    .catch((error) => {
      // Allow a later request (or cold start) to retry instead of caching the
      // failure forever.
      dbCache.promise = null;
      console.error(`[db] connection failed: ${error.message}`);
      throw error;
    });

  return dbCache.promise;
}

export function disconnectDb() {
  dbCache.promise = null;
  return mongoose.disconnect();
}

export default connectDb;
