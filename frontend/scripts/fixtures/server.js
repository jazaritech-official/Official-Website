#!/usr/bin/env node
/** 
 * Fixture API server for test environment.
 * Serves mock data for verify-orders.mjs and verify-three.mjs when 
 * MongoMemoryServer cannot start (no mongod binary available).
 * 
 * Run: node server.js  (port 5001)
 *      API base: http://localhost:5001/api
 */

const http = require('http');
const url = require('url');

// Service data from seed-core.js SERVICES array
const SERVICES = [
  {
    title: "Software Solutions",
    slug: "software-solutions",
    icon: "code",
    description: "Custom platforms, internal tools and integrations engineered around the way your business actually operates.",
    shortDescription: "Custom platforms and integrations built around how you work.",
    highlights: ["Web & mobile apps", "API integrations", "Legacy modernisation"],
    category: "engineering",
    accent: "blue",
  },
  {
    title: "Business Growth",
    slug: "business-growth",
    icon: "chart",
    description: "Strategy, process and technology roadmaps that turn operational efficiency into measurable revenue growth.",
    shortDescription: "Roadmaps that turn operational efficiency into measurable growth.",
    highlights: ["Growth strategy", "Process automation", "Analytics"],
    category: "growth",
    accent: "green-micro",
  },
  {
    title: "Graphic Designing",
    slug: "graphic-designing",
    icon: "palette",
    description: "Brand identities, visual systems and marketing collateral crafted for consistency across every touchpoint.",
    shortDescription: "Brand identities and visual systems that stay consistent.",
    highlights: ["Brand identity", "Design systems", "Collateral"],
    category: "design",
    accent: "blue",
  },
  {
    title: "Marketing",
    slug: "marketing",
    icon: "megaphone",
    description: "Performance marketing, SEO and content programmes that put your products in front of the right audience.",
    shortDescription: "Marketing, SEO and content that reach the right audience.",
    highlights: ["SEO", "Paid campaigns", "Content strategy"],
    category: "growth",
    accent: "blue",
  },
  {
    title: "AI Solutions",
    slug: "ai-solutions",
    icon: "chip",
    description: "Practical AI — document intelligence, recommendation engines and automation that remove repetitive work.",
    shortDescription: "Practical AI that automates repetitive work and surfaces insight.",
    highlights: ["Document AI", "Recommendations", "Automation"],
    category: "engineering",
    accent: "blue",
  },
  {
    title: "E-commerce",
    slug: "e-commerce",
    icon: "cart",
    description: "Storefronts, checkout flows and order operations built to convert and to scale through peak demand.",
    shortDescription: "Storefronts and checkout flows built to convert and scale.",
    highlights: ["Storefronts", "Checkout", "Order operations"],
    category: "engineering",
    accent: "blue",
  },
  {
    title: "Mobile App Development",
    slug: "mobile-app-development",
    icon: "mobile",
    description: "Native and cross-platform applications with dependable performance and a genuinely polished feel.",
    shortDescription: "Native and cross-platform apps with dependable performance.",
    highlights: ["iOS & Android", "React Native", "App maintenance"],
    category: "engineering",
    accent: "blue",
  },
  {
    title: "Web Development",
    slug: "web-development",
    slug: "web-development",
    icon: "website",
    description: "Fast, accessible and search-friendly websites engineered for longevity, not just launch day.",
    shortDescription: "Fast, accessible websites built to last beyond launch day.",
    highlights: ["Next.js", "Accessibility", "Core Web Vitals"],
    category: "engineering",
    accent: "blue",
  },
  {
    title: "UI/UX Design",
    slug: "ui-ux-design",
    icon: "pen",
    description: "Research-led interface design that makes complex products feel effortless for the people using them.",
    shortDescription: "Research-led design that makes complex products feel simple.",
    highlights: ["User research", "Interface design", "Prototyping"],
    category: "design",
    accent: "blue",
  },
  {
    title: "Cloud and DevOps",
    slug: "cloud-and-devops",
    icon: "cloud",
    description: "Cloud architecture, CI/CD and observability so releases are routine and infrastructure stays predictable.",
    shortDescription: "Cloud architecture, CI/CD and observability for stable releases.",
    highlights: ["Cloud architecture", "CI/CD", "Observability"],
    category: "operations",
    accent: "blue",
  },
  {
    title: "Cybersecurity",
    slug: "cybersecurity",
    icon: "shield",
    description: "Hardening, review and monitoring that protect customer data and keep your compliance posture solid.",
    shortDescription: "Hardening and monitoring that protect customer data.",
    highlights: ["Security review", "Hardening", "Monitoring"],
    category: "security",
    accent: "navy",
  },
  {
    title: "Data and Analytics",
    slug: "data-and-analytics",
    icon: "analytics",
    description: "Pipelines, warehousing and dashboards that turn scattered operational data into decisions you can defend.",
    shortDescription: "Pipelines and dashboards that turn scattered data into decisions.",
    highlights: ["Data pipelines", "Warehousing", "Dashboards"],
    category: "operations",
    accent: "blue",
  },
  {
    title: "IT Consulting",
    slug: "it-consulting",
    icon: "consulting",
    description: "Vendor-neutral technical guidance for platform selection, modernisation and delivery strategy.",
    shortDescription: "Vendor-neutral guidance for platform and delivery decisions.",
    highlights: ["Platform strategy", "Modernisation", "Delivery"],
    category: "operations",
    accent: "navy",
  },
  {
    title: "Automation",
    slug: "automation",
    icon: "automation",
    description: "Workflow and back-office automation that removes manual handoffs and the errors that come with them.",
    shortDescription: "Workflow automation that removes manual handoffs and errors.",
    highlights: ["Workflow design", "Integrations", "RPA"],
    category: "engineering",
    accent: "blue",
  },
];

// Sample products from seed-core.js SAMPLE_PRODUCTS
const SAMPLE_PRODUCTS = [
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

// Push public key (example VAPID key)
const PUSH_PUBLIC_KEY = "BCm2_xY-ZY2gZkLZ_HM3b1YBCJQoz5AISn3VY6Q5PqrbK8GDaPlQq8q2m1QF2os9u5Z4PtCvTyGHK8Rhp9qdFI";

// Build service list response
function buildServicesResponse() {
  return SERVICES.map((s, i) => ({
    id: i + 1,
    title: s.title,
    slug: s.slug,
    shortDescription: s.shortDescription,
    highlights: s.highlights,
    category: s.category,
    accent: s.accent,
  }));
}

// Build product list response
function buildProductsResponse() {
  return SAMPLE_PRODUCTS.map((p) => ({
    name: p.name,
    category: p.category,
    productUrl: p.productUrl,
    logo: p.logo,
    highlightPoints: p.highlightPoints,
    isPublished: p.isPublished,
    sortOrder: p.sortOrder,
  }));
}

// Build logos response (derived from product logos)
function buildLogosResponse() {
  const logos = new Map();
  SAMPLE_PRODUCTS.forEach((p) => {
    if (p.logo) {
      logos.set(p.name, p.logo);
    }
  });
  return Array.from(logos.entries());
}

// Handle API routes
function handleRequest(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // /api/health
  if (pathname === '/api/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  // /api/services
  if (pathname === '/api/services') {
    res.writeHead(200);
    res.end(JSON.stringify(buildServicesResponse()));
    return;
  }

  // /api/products
  if (pathname === '/api/products') {
    res.writeHead(200);
    res.end(JSON.stringify(buildProductsResponse()));
    return;
  }

  // /api/logos
  if (pathname === '/api/logos') {
    res.writeHead(200);
    res.end(JSON.stringify(buildLogosResponse()));
    return;
  }

  // /api/push/public-key
  if (pathname === '/api/push/public-key') {
    res.writeHead(200);
    res.end(JSON.stringify({ publicKey: PUSH_PUBLIC_KEY }));
    return;
  }

  // 404
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

// Create server
const server = http.createServer(handleRequest);
const PORT = parseInt(process.env.PORT || '5001', 10);

server.listen(PORT, () => {
  console.log(`[fixture] API server running at http://localhost:${PORT}`);
  console.log(`[fixture] API base: http://localhost:${PORT}/api`);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`[fixture] Port ${PORT} is already in use`);
  } else {
    console.error(`[fixture] Server error: ${e.message}`);
  }
});