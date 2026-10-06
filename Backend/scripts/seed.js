#!/usr/bin/env node
/**
 * Database seed — `npm run seed`
 *
 * Development / normal seeding. Idempotent:
 *  - Admin account (from ADMIN_EMAIL / ADMIN_PASSWORD) is created or updated.
 *  - Product type templates and services are upserted by their unique keys.
 *  - Sample products are only inserted when the collection is empty.
 *
 * Never seeds fake visitor traffic or submissions.
 *
 * The actual data + upsert logic lives in `scripts/seed-core.js` so the
 * production seed (`npm run seed:prod`) can never drift away from it.
 */
import env from "../config/env.js";
import { seedDatabase, disconnectDb } from "./seed-core.js";

async function run() {
  if (!env.admin.email || !env.admin.password) {
    console.error("\n[seed] ADMIN_EMAIL and ADMIN_PASSWORD must be set in Backend/.env before seeding.\n");
    process.exit(1);
  }

  const result = await seedDatabase({
    uri: env.mongoUri,
    adminEmail: env.admin.email,
    adminPassword: env.admin.password,
    adminName: env.admin.name,
    resetPassword: env.admin.resetPasswordOnSeed,
    demoEmail: env.admin.demoEmail,
    sampleContent: true,
  });

  console.log(`[seed] super admin ready: ${env.admin.email.toLowerCase().trim()} (${result.admin.id})`);
  console.log("\n[seed] done.");
  console.log(`  templates: ${result.counts.templates}`);
  console.log(`  services:  ${result.counts.services}`);
  console.log(`  products:  ${result.counts.products}`);
  console.log("\nSign in at /admin/login with the seeded admin credentials.\n");

  await disconnectDb();
}

run().catch((error) => {
  console.error(`[seed] failed: ${error.message}`);
  process.exit(1);
});
