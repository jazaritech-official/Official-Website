/** TEMP diagnostic — delete after use. */
import mongoose from "mongoose";
import env from "../config/env.js";
await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 15000 });
const db = mongoose.connection.db;
console.log("db name:", db.databaseName);
const names = (await db.listCollections().toArray()).map((x) => x.name).sort();
console.log("collections:", names.join(", "));
for (const n of ["clients", "orders", "payees", "catalogitems", "financesettings", "counters", "submissions", "products"]) {
  try { console.log(" ", n + ":", await db.collection(n).countDocuments()); } catch { console.log(" ", n + ": err"); }
}
await mongoose.disconnect();
