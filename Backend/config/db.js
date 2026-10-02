import mongoose from "mongoose";
import env from "./env.js";

mongoose.set("strictQuery", true);

let connecting = null;

/**
 * Connect to MongoDB. Safe to call multiple times — concurrent calls share a
 * single connection attempt.
 */
export function connectDb(uri = env.mongoUri) {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose.connection);
  if (connecting) return connecting;

  connecting = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 10_000,
      autoIndex: !env.isProd,
    })
    .then((mongooseInstance) => {
      console.log(`[db] connected (${mongooseInstance.connection.readyState === 1 ? "ready" : "?"})`);
      return mongooseInstance.connection;
    })
    .catch((error) => {
      connecting = null;
      console.error(`[db] connection failed: ${error.message}`);
      throw error;
    });

  return connecting;
}

export function disconnectDb() {
  return mongoose.disconnect();
}

export default connectDb;
