/** TEMP diagnostic — delete after use. */
import mongoose from "mongoose";
import env from "../config/env.js";
await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 15000 });
const db = mongoose.connection.db;
const docs = await db.collection("auditlogs").find({}).sort({ createdAt: -1 }).limit(15).toArray();
for (const d of docs) {
  const { _id, ...rest } = d;
  console.log(JSON.stringify(rest).slice(0, 220));
}
const admin = await db.collection("admins").findOne({ email: env.admin.email }, { projection: { lastLoginAt: 1, updatedAt: 1, createdAt: 1, role: 1 } });
console.log("admin timestamps:", JSON.stringify(admin));
await mongoose.disconnect();
