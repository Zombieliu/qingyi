#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, "..");
const SRC_ROOT = path.join(APP_ROOT, "src");
const API_ROOT = path.join(SRC_ROOT, "app/api");
const OUT_FILE = path.resolve(APP_ROOT, "../../docs/cloudflare-api-route-matrix.md");

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];
const NODE_CORE_MODULES = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);
const NODE_BOUND_PACKAGES = ["stripe", "web-push"];

function listRouteFiles(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && entry.name === "route.ts") {
        files.push(full);
      }
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function collectImports(code) {
  const imports = new Set();
  const staticRe = /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicRe = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  let match = staticRe.exec(code);
  while (match) {
    imports.add(match[1]);
    match = staticRe.exec(code);
  }
  match = dynamicRe.exec(code);
  while (match) {
    imports.add(match[1]);
    match = dynamicRe.exec(code);
  }
  return [...imports];
}

function resolveInternalImport(spec, fromFile) {
  let basePath = "";
  if (spec.startsWith("@/")) {
    basePath = path.join(SRC_ROOT, spec.slice(2));
  } else if (spec.startsWith("./") || spec.startsWith("../")) {
    basePath = path.resolve(path.dirname(fromFile), spec);
  } else {
    return null;
  }

  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    `${basePath}.cjs`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.js"),
    path.join(basePath, "index.mjs"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function extractMethods(code) {
  const methods = new Set();
  const methodRe =
    /\bexport\s+(?:const|async function|function)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g;
  let match = methodRe.exec(code);
  while (match) {
    methods.add(match[1]);
    match = methodRe.exec(code);
  }
  return HTTP_METHODS.filter((method) => methods.has(method));
}

function extractRuntime(code) {
  const runtimeMatch = code.match(/\bexport\s+const\s+runtime\s*=\s*["']([^"']+)["']/);
  if (!runtimeMatch) return "unspecified";
  return runtimeMatch[1];
}

function toApiPath(routeFile) {
  const rel = path.relative(API_ROOT, routeFile).replace(/\\/g, "/");
  const dir = rel.replace(/\/route\.ts$/, "");
  if (!dir || dir === "route.ts") return "/api";
  return `/api/${dir}`;
}

function routeOwner(apiPath) {
  const first = apiPath.replace(/^\/api\/?/, "").split("/")[0] || "root";
  const map = {
    admin: "admin",
    announcements: "content",
    auth: "auth",
    chain: "chain",
    companion: "companion",
    coupons: "growth",
    cron: "platform",
    disputes: "ops",
    "duo-orders": "orders",
    events: "realtime",
    examiners: "ops",
    guardians: "ops",
    health: "platform",
    invoices: "finance",
    kook: "integrations",
    ledger: "ledger",
    "live-applications": "ops",
    mantou: "ledger",
    notifications: "growth",
    orders: "orders",
    pay: "payments",
    players: "growth",
    push: "growth",
    redeem: "growth",
    referral: "growth",
    support: "support",
    track: "growth",
    user: "user",
    v1: "platform",
    vip: "vip",
    vitals: "platform",
  };
  return map[first] || first;
}

function detectPackageName(spec) {
  if (spec.startsWith("@")) {
    const [scope, name] = spec.split("/");
    return scope && name ? `${scope}/${name}` : spec;
  }
  return spec.split("/")[0];
}

function analyzeRoute(routeFile) {
  const entryCode = readText(routeFile);
  const methods = extractMethods(entryCode);
  const runtime = extractRuntime(entryCode);

  const visited = new Set();
  const queue = [routeFile];
  const signals = new Set();

  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    const code = readText(file);
    if (!code) continue;

    if (code.includes("from \"@prisma/client\"") || code.includes("from '@prisma/client'")) {
      signals.add("prisma-client");
    }
    if (
      file === path.join(SRC_ROOT, "lib/db.ts") ||
      code.includes("from \"@/lib/db\"") ||
      code.includes("from '@/lib/db'") ||
      code.includes("from \"../db\"") ||
      code.includes("from '../db'")
    ) {
      signals.add("prisma-db");
    }
    if (/\bnew\s+PrismaClient\b/.test(code)) {
      signals.add("prisma-client");
    }
    if (/\beval\s*\(/.test(code) || /\bnew\s+Function\s*\(/.test(code)) {
      signals.add("dynamic-codegen");
    }

    const imports = collectImports(code);
    for (const spec of imports) {
      const resolved = resolveInternalImport(spec, file);
      if (resolved) {
        queue.push(resolved);
        continue;
      }

      const packageName = detectPackageName(spec);
      if (spec.startsWith("node:")) {
        signals.add(`node-core:${spec.slice(5)}`);
      } else if (NODE_CORE_MODULES.has(packageName)) {
        signals.add(`node-core:${packageName}`);
      }
      if (NODE_BOUND_PACKAGES.includes(packageName)) {
        signals.add(`node-pkg:${packageName}`);
      }
      if (packageName === "@prisma/client") {
        signals.add("prisma-client");
      }
    }
  }

  const hasPrisma = [...signals].some((signal) => signal.startsWith("prisma-"));
  const hasNodeBoundSignal = [...signals].some(
    (signal) =>
      signal.startsWith("node-core:") ||
      signal.startsWith("node-pkg:") ||
      signal === "dynamic-codegen"
  );

  let classification = "CF-safe";
  if (hasPrisma) {
    classification = "DB-edge-candidate";
  } else if (runtime === "nodejs" || hasNodeBoundSignal) {
    classification = "Node-bound";
  }

  const migrationStatusMap = {
    "CF-safe": "ready",
    "DB-edge-candidate": "pending-db-migration",
    "Node-bound": "requires-fallback-or-redesign",
  };

  return {
    route: toApiPath(routeFile),
    methods: methods.length > 0 ? methods.join(",") : "unknown",
    runtime,
    classification,
    owner: routeOwner(toApiPath(routeFile)),
    migrationStatus: migrationStatusMap[classification],
    signals: [...signals].sort(),
  };
}

function renderMarkdown(items) {
  const now = new Date().toISOString();
  const counts = {
    "CF-safe": 0,
    "DB-edge-candidate": 0,
    "Node-bound": 0,
  };
  for (const item of items) {
    counts[item.classification] += 1;
  }

  const lines = [];
  lines.push("# Cloudflare API Route Runtime Matrix");
  lines.push("");
  lines.push(`Generated at: \`${now}\``);
  lines.push("");
  lines.push("## Rules");
  lines.push("- `DB-edge-candidate`: import graph touches Prisma (`@/lib/db` or `@prisma/client`).");
  lines.push("- `Node-bound`: explicit `runtime = \"nodejs\"` or Node-core / node-only package signals.");
  lines.push("- `CF-safe`: no Prisma and no node-bound signals found by static scan.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Class | Count |");
  lines.push("| --- | ---: |");
  lines.push(`| CF-safe | ${counts["CF-safe"]} |`);
  lines.push(`| DB-edge-candidate | ${counts["DB-edge-candidate"]} |`);
  lines.push(`| Node-bound | ${counts["Node-bound"]} |`);
  lines.push(`| Total | ${items.length} |`);
  lines.push("");
  lines.push("## Route Matrix");
  lines.push("");
  lines.push(
    "| Route | Methods | Runtime | Class | Owner | Migration Status | Signals |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const item of items) {
    const signals = item.signals.length > 0 ? item.signals.join(", ") : "-";
    lines.push(
      `| \`${item.route}\` | \`${item.methods}\` | \`${item.runtime}\` | \`${item.classification}\` | \`${item.owner}\` | \`${item.migrationStatus}\` | ${signals} |`
    );
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("- This is a static dependency scan and may under/over-report in dynamic import branches.");
  lines.push("- Re-generate after major route or data-layer changes.");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function main() {
  const routes = listRouteFiles(API_ROOT);
  const matrix = routes.map((file) => analyzeRoute(file));
  matrix.sort((a, b) => a.route.localeCompare(b.route));
  const markdown = renderMarkdown(matrix);
  fs.writeFileSync(OUT_FILE, markdown, "utf8");

  const summary = matrix.reduce(
    (acc, item) => {
      acc[item.classification] += 1;
      return acc;
    },
    { "CF-safe": 0, "DB-edge-candidate": 0, "Node-bound": 0 }
  );

  console.log(`[cf-matrix] Wrote ${OUT_FILE}`);
  console.log(
    `[cf-matrix] totals: total=${matrix.length}, cf-safe=${summary["CF-safe"]}, db-edge=${summary["DB-edge-candidate"]}, node-bound=${summary["Node-bound"]}`
  );
}

main();
