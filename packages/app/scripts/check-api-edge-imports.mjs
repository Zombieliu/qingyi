#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, "..");
const API_ROOT = path.join(APP_ROOT, "src", "app", "api");

const FORBIDDEN_IMPORT_PATTERNS = [
  { label: "@/lib/db", test: (spec) => spec === "@/lib/db" },
  { label: "@prisma/client", test: (spec) => spec === "@prisma/client" },
  { label: "node:*", test: (spec) => spec.startsWith("node:") },
];

const IMPORT_RE = /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
const RUNTIME_NODE_RE = /\bexport\s+const\s+runtime\s*=\s*["']nodejs["']/;

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
      } else if (entry.isFile() && entry.name === "route.ts") {
        files.push(full);
      }
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function collectImports(code) {
  const specs = [];
  let match = IMPORT_RE.exec(code);
  while (match) {
    specs.push(match[1]);
    match = IMPORT_RE.exec(code);
  }
  return specs;
}

function toDisplayPath(file) {
  return path.relative(APP_ROOT, file).replace(/\\/g, "/");
}

function main() {
  const routeFiles = listRouteFiles(API_ROOT);
  const violations = [];

  for (const file of routeFiles) {
    const code = fs.readFileSync(file, "utf8");
    const specs = collectImports(code);

    for (const spec of specs) {
      for (const rule of FORBIDDEN_IMPORT_PATTERNS) {
        if (rule.test(spec)) {
          violations.push(`${toDisplayPath(file)} -> forbidden import: ${spec} (${rule.label})`);
        }
      }
    }

    if (RUNTIME_NODE_RE.test(code)) {
      violations.push(`${toDisplayPath(file)} -> forbidden runtime declaration: runtime = "nodejs"`);
    }
  }

  if (violations.length > 0) {
    console.error("[cf-guard] Found API edge-compat violations:\n");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exit(1);
  }

  console.log(`[cf-guard] OK (${routeFiles.length} route files scanned)`);
}

main();
