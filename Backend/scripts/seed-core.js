/**
 * seed-core.js — shared seed data + idempotent seeding routine.
 *
 * This module has NO top-level side effects: importing it never connects to a
 * database and never calls process.exit. Two thin wrappers drive it:
 *
 *   scripts/seed.js       → `npm run seed`      (development; samples allowed)
 *   scripts/seed-prod.js  → `npm run seed:prod` (production; explicit confirm)
 *
 * Keeping the data and the upsert logic in one place guarantees the two entry
 * points can never drift apart.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import Admin from "../models/Admin.js";
import ProductTypeTemplate from "../models/ProductTypeTemplate.js";
import Product from "../models/Product.js";
import Service from "../models/Service.js";

export const TEMPLATES = [
  {
    type: "E-commerce",
    highlightPoints: [
      "Secure checkout flow",
      "Inventory management",
      "Multiple payment gateways",
      "Order tracking",
      "Mobile-optimized storefront",
    ],
  },
  {
    type: "SaaS",
    highlightPoints: [
      "Subscription billing",
      "Multi-tenant architecture",
      "Role-based access control",
      "Real-time dashboards",
      "Automatic updates",
    ],
  },
  {
    type: "AI Tool",
    highlightPoints: [
      "Intelligent automation",
      "AI-powered workflows",
      "Smart recommendations",
      "Scalable architecture",
    ],
  },
  {
    type: "Mobile App",
    highlightPoints: [
      "Responsive mobile experience",
      "Push-ready architecture",
      "Smooth user flows",
      "Scalable backend",
    ],
  },
  {
    type: "Website",
    highlightPoints: [
      "Responsive design",
      "SEO-ready architecture",
      "Fast performance",
      "Conversion-focused UX",
    ],
  },
  {
    type: "Marketing",
    highlightPoints: [
      "Campaign management",
      "Audience targeting",
      "Analytics reporting",
      "Conversion optimization",
    ],
  },
  {
    type: "Design",
    highlightPoints: [
      "Premium visual systems",
      "Brand consistency",
      "Responsive layouts",
      "Reusable components",
    ],
  },
  {
    type: "ERP / Business Software",
    highlightPoints: [
      "Centralized operations",
      "Workflow automation",
      "Custom reporting",
      "Role-based access",
    ],
  },
];

// Exploded Logo Services Hub placements: at most one service per ribbon piece
// (slot 0..4). Absent slugs are simply not featured in the hub.
export const HUB_SLOTS = {
  "web-development": { hubSlot: 0, hubLabel: "Web Development" },
  "ai-solutions": { hubSlot: 1, hubLabel: "AI Solutions" },
  "e-commerce": { hubSlot: 2, hubLabel: "E-commerce" },
  "business-growth": { hubSlot: 3, hubLabel: "Business Growth" },
  "it-consulting": { hubSlot: 4, hubLabel: "IT Consulting" },
};

export const SERVICES = [
  {
    title: "Software Solutions",
    slug: "software-solutions",
    icon: "code",
    description:
      "Custom platforms, internal tools and integrations engineered around the way your business actually operates.",
  },
  {
    title: "Business Growth",
    slug: "business-growth",
    icon: "chart",
    description:
      "Strategy, process and technology roadmaps that turn operational efficiency into measurable revenue growth.",
  },
  {
    title: "Graphic Designing",
    slug: "graphic-designing",
    icon: "palette",
    description:
      "Brand identities, visual systems and marketing collateral crafted for consistency across every touchpoint.",
  },
  {
    title: "Marketing",
    slug: "marketing",
    icon: "megaphone",
    description:
      "Performance marketing, SEO and content programmes that put your products in front of the right audience.",
  },
  {
    title: "AI Solutions",
    slug: "ai-solutions",
    icon: "chip",
    description:
      "Practical AI — document intelligence, recommendation engines and automation that remove repetitive work.",
  },
  {
    title: "E-commerce",
    slug: "e-commerce",
    icon: "cart",
    description:
      "Storefronts, checkout flows and order operations built to convert and to scale through peak demand.",
  },
  {
    title: "Mobile App Development",
    slug: "mobile-app-development",
    icon: "mobile",
    description:
      "Native and cross-platform applications with dependable performance and a genuinely polished feel.",
  },
  {
    title: "Web Development",
    slug: "web-development",
    icon: "website",
    description:
      "Fast, accessible and search-friendly websites engineered for longevity, not just launch day.",
  },
  {
    title: "UI/UX Design",
    slug: "ui-ux-design",
    icon: "pen",
    description:
      "Research-led interface design that makes complex products feel effortless for the people using them.",
  },
  {
    title: "Cloud and DevOps",
    slug: "cloud-and-devops",
    icon: "cloud",
    description:
      "Cloud architecture, CI/CD and observability so releases are routine and infrastructure stays predictable.",
  },
  {
    title: "Cybersecurity",
    slug: "cybersecurity",
    icon: "shield",
    description:
      "Hardening, review and monitoring that protect customer data and keep your compliance posture solid.",
  },
  {
    title: "Data and Analytics",
    slug: "data-and-analytics",
    icon: "analytics",
    description:
      "Pipelines, warehousing and dashboards that turn scattered operational data into decisions you can defend.",
  },
  {
    title: "IT Consulting",
    slug: "it-consulting",
    icon: "consulting",
    description:
      "Vendor-neutral technical guidance for platform selection, modernisation and delivery strategy.",
  },
  {
    title: "Automation",
    slug: "automation",
    icon: "automation",
    description:
      "Workflow and back-office automation that removes manual handoffs and the errors that come with them.",
  },
];

// Sample products — clearly structured seed content, replaceable via the admin portal.
export const SAMPLE_PRODUCTS = [
  {
    name: "Jazari Commerce Suite",
    category: "E-commerce",
    productUrl: "",
    logo: "",
    highlightPoints: [
      "Secure checkout with multiple payment gateways",
      "Real-time inventory and order tracking",
      "Mobile-optimized storefront",
      "Admin analytics for sales performance",
    ],
    isPublished: true,
    sortOrder: 10,
  },
  {
    name: "Jazari Flow",
    category: "SaaS",
    productUrl: "",
    logo: "",
    highlightPoints: [
      "Subscription billing and multi-tenant access",
      "Role-based permissions for every team",
      "Real-time operational dashboards",
      "Automatic updates with zero downtime",
    ],
    isPublished: true,
    sortOrder: 20,
  },
  {
    name: "Jazari Pulse",
    category: "AI Tool",
    productUrl: "",
    logo: "",
    highlightPoints: [
      "AI-powered workflow automation",
      "Smart recommendations from your own data",
      "Scalable architecture for growing teams",
    ],
    isPublished: true,
    sortOrder: 30,
  },
  {
    name: "Jazari Desk",
    category: "ERP / Business Software",
    productUrl: "",
    logo: "",
    highlightPoints: [
      "Centralized operations in one workspace",
      "Workflow automation and custom reporting",
      "Role-based access for departments",
    ],
    isPublished: true,
    sortOrder: 40,
  },
];

/**
 * Idempotently seed the database.
 *
 * @param {object} options
 * @param {string} options.uri             MongoDB connection string (never logged).
 * @param {string} options.adminEmail      Configured admin email (normalized).
 * @param {string} options.adminPassword   Only used when creating / resetting.
 * @param {string} [options.adminName]     Display name for the admin.
 * @param {boolean} [options.resetPassword] Overwrite an existing admin password.
 * @param {string} [options.demoEmail]     Legacy/demo account to deactivate.
 * @param {boolean} [options.sampleContent] Insert sample products when empty.
 * @param {(message: string) => void} [options.log]
 * @returns {Promise<{admin: {id: string, role: string, isActive: boolean, created: boolean}, counts: {templates: number, services: number, products: number}, templateCount: number, serviceCount: number}>}
 */
export async function seedDatabase({
  uri,
  adminEmail,
  adminPassword,
  adminName = "",
  resetPassword = false,
  demoEmail = "",
  sampleContent = true,
  log = console.log,
}) {
  const email = String(adminEmail || "").toLowerCase().trim();
  if (!email || !adminPassword) {
    throw new Error("adminEmail and adminPassword are required to seed.");
  }

  await connectDb(uri);

  // --- Role migration (legacy documents) ----------------------------------
  // Older installs used `editor` / `super-admin`; fold them onto the current
  // role set without deactivating anyone.
  const demotedLegacy = await Admin.updateMany({ role: "editor" }, { $set: { role: "admin" } });
  const promotedLegacy = await Admin.updateMany(
    { role: "super-admin" },
    { $set: { role: "super_admin" } },
  );
  if (demotedLegacy.modifiedCount || promotedLegacy.modifiedCount) {
    log(
      `[seed] normalized legacy admin roles (${demotedLegacy.modifiedCount + promotedLegacy.modifiedCount} document(s))`,
    );
  }

  // --- Configured admin → super_admin (idempotent) ------------------------
  const existingAdmin = await Admin.findOne({ email });
  const descriptor = adminName || existingAdmin?.name || "Super Admin";
  let adminCreated = false;
  let admin;

  if (existingAdmin) {
    // Promote + activate. The password is preserved unless the explicit reset
    // flag is enabled — re-running the seed never clobbers a live password.
    existingAdmin.role = Admin.SUPER_ADMIN;
    existingAdmin.isActive = true;
    if (!existingAdmin.name) existingAdmin.name = descriptor;
    if (resetPassword) {
      existingAdmin.passwordHash = await Admin.hashPassword(adminPassword);
    }
    admin = await existingAdmin.save();
    if (resetPassword) log("[seed] configured admin password reset (opt-in).");
  } else {
    admin = await Admin.create({
      email,
      name: descriptor,
      role: Admin.SUPER_ADMIN,
      isActive: true,
      passwordHash: await Admin.hashPassword(adminPassword),
    });
    adminCreated = true;
  }

  // --- Legacy/demo admin cleanup ------------------------------------------
  // A previously shipped demo account is deactivated (never deleted) unless it
  // is the configured account. Its password is never read or printed.
  const normalizedDemo = String(demoEmail || "").toLowerCase().trim();
  if (normalizedDemo && normalizedDemo !== email) {
    const demo = await Admin.findOne({ email: normalizedDemo });
    if (demo && demo.isActive !== false) {
      demo.isActive = false;
      await demo.save();
      log("[seed] previous demo admin deactivated (not the configured account).");
    }
  }

  // --- Product type templates --------------------------------------------
  let templatesUpserted = 0;
  for (const template of TEMPLATES) {
    await ProductTypeTemplate.updateOne(
      { type: template.type },
      { $set: { highlightPoints: template.highlightPoints }, $setOnInsert: { type: template.type } },
      { upsert: true },
    );
    templatesUpserted += 1;
  }
  log(`[seed] product type templates upserted: ${templatesUpserted}`);

  // --- Services -----------------------------------------------------------
  let servicesUpserted = 0;
  for (const [index, service] of SERVICES.entries()) {
    const { slug, ...fields } = service;
    // Optional Exploded Logo Services Hub placement (backward compatible):
    // services outside the map are reset to "not featured" (null slot).
    const hub = HUB_SLOTS[slug] ?? { hubSlot: null, hubLabel: "" };
    await Service.updateOne(
      { slug },
      {
        $set: { ...fields, sortOrder: (index + 1) * 10, isVisible: true, ...hub },
        $setOnInsert: { slug },
      },
      { upsert: true },
    );
    servicesUpserted += 1;
  }
  log(`[seed] services upserted: ${servicesUpserted}`);

  // --- Sample products (only when explicitly allowed AND collection empty) -
  if (sampleContent) {
    const productCount = await Product.countDocuments();
    if (productCount === 0) {
      await Product.insertMany(SAMPLE_PRODUCTS);
      log(`[seed] sample products inserted: ${SAMPLE_PRODUCTS.length} (seed/sample content)`);
    } else {
      log(`[seed] products already present (${productCount}) — sample products skipped`);
    }
  } else {
    log("[seed] sample products disabled (SEED_SAMPLE_CONTENT is not true)");
  }

  const [templateTotal, serviceTotal, productTotal] = await Promise.all([
    ProductTypeTemplate.countDocuments(),
    Service.countDocuments(),
    Product.countDocuments(),
  ]);

  const result = {
    admin: {
      id: admin._id.toString(),
      role: admin.role,
      isActive: admin.isActive !== false,
      created: adminCreated,
    },
    templateCount: templateTotal,
    serviceCount: serviceTotal,
    counts: { templates: templateTotal, services: serviceTotal, products: productTotal },
  };
  return result;
}

export { connectDb, disconnectDb };
