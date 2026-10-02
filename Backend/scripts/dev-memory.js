#!/usr/bin/env node
/**
 * `npm run dev:mem` — boots an ephemeral in-memory MongoDB and runs the API
 * against it. Useful when no local MongoDB is available (development/demo).
 *
 * `npm run seed:mem` — same, but seeds the database first.
 *
 * Production and normal development should use a real MongoDB (Backend/.env).
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wantSeed = process.argv.includes("--seed");
const seedOnly = process.argv.includes("--seed-only");

console.log("[dev:mem] starting in-memory MongoDB…");
const mongod = await MongoMemoryServer.create();
const uri = mongod.getUri("jazari");
console.log(`[dev:mem] ready at ${uri}`);

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

if (wantSeed || seedOnly) {
  const seedExit = await run(["scripts/seed.js"], { MONGODB_URI: uri });
  if (seedExit !== 0) {
    console.error("[dev:mem] seed failed — aborting.");
    await mongod.stop();
    process.exit(seedExit);
  }
}

if (seedOnly) {
  console.log("[dev:mem] seed-only mode — stopping in-memory MongoDB.");
  await mongod.stop();
  process.exit(0);
}

const server = spawn(process.execPath, ["server.js"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, MONGODB_URI: uri },
});

const shutdown = async (signal) => {
  console.log(`\n[dev:mem] ${signal} received, stopping…`);
  server.kill(signal);
  await mongod.stop();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

server.on("exit", async (code) => {
  await mongod.stop();
  process.exit(code ?? 0);
});
