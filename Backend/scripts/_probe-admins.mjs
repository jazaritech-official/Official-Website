/** TEMP diagnostic — delete after use. Lists admins (no hashes) and tests .env creds. */
import { readFileSync } from "node:fs";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import env from "../config/env.js";
import Admin from "../models/Admin.js";

function readEnvFile() {
  try {
    const out = {};
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (out[m?.[1]] === undefined && m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 15000 });
const admins = await Admin.find({}).select("email role isActive").lean();
console.log("admins:", admins.map((a) => ({ email: a.email, role: a.role, isActive: a.isActive })));

const fileEnv = readEnvFile();
const email = process.env.ADMIN_EMAIL || fileEnv.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD || fileEnv.ADMIN_PASSWORD;
console.log("env email matches a user:", admins.some((a) => a.email === email), "| password len:", password?.length);

const user = await Admin.findOne({ email }).select("+passwordHash");
if (user) {
  const ok = await bcrypt.compare(password, user.passwordHash);
  console.log("env password verifies against stored hash:", ok);
} else {
  console.log("no admin with env email");
}
await mongoose.disconnect();
