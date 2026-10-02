#!/usr/bin/env node
/**
 * Syntax check for the backend (`npm run build`).
 * Every .js file is parsed without executing it, so a broken file fails the
 * build even though there is no compile step.
 */
import { readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SKIP_DIRS = new Set(["node_modules", "uploads", "coverage", ".git"]);

async function collect(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await collect(path.join(dir, entry.name), out);
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const files = await collect(root);
let failures = 0;

for (const file of files) {
  try {
    await execFileAsync(process.execPath, ["--check", file]);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${path.relative(root, file)}`);
    console.error(error.stderr || error.message);
  }
}

if (failures > 0) {
  console.error(`\nSyntax check failed: ${failures} file(s) with errors.`);
  process.exit(1);
}

console.log(`Syntax check passed: ${files.length} files verified.`);
console.log("Note: the backend ships as plain ESM — there is no compile step.");
