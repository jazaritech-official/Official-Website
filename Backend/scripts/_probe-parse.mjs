/** TEMP diagnostic — delete after use. */
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Admin from "../models/Admin.js";

const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
const dotenvVal = dotenv.parse(raw).ADMIN_PASSWORD;

let regexVal;
for (const line of raw.split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && m[1] === "ADMIN_PASSWORD") { regexVal = m[2].trim().replace(/^["']|["']$/g, ""); break; }
}

console.log("dotenv len:", dotenvVal?.length, "| regex len:", regexVal?.length, "| equal:", dotenvVal === regexVal);

import env from "../config/env.js";
await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 15000 });
const user = await Admin.findOne({ email: env.admin.email }).select("+passwordHash");
if (user) {
  console.log("dotenv value verifies:", await bcrypt.compare(dotenvVal, user.passwordHash));
  console.log("regex value verifies:", await bcrypt.compare(regexVal, user.passwordHash));
}
await mongoose.disconnect();
