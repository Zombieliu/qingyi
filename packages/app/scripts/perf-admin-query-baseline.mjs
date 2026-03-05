#!/usr/bin/env node

import { performance } from "node:perf_hooks";
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = {
    iterations: 50,
    warmup: 5,
    output: "",
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--iterations" && argv[i + 1]) {
      args.iterations = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--warmup" && argv[i + 1]) {
      args.warmup = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--output" && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--json") {
      args.json = true;
    }
  }
  return {
    iterations: Number.isFinite(args.iterations) ? Math.max(1, Math.trunc(args.iterations)) : 50,
    warmup: Number.isFinite(args.warmup) ? Math.max(0, Math.trunc(args.warmup)) : 5,
    output: args.output,
    json: args.json,
  };
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[index].toFixed(3));
}

function avg(values) {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}

function collectPlanNodes(node, acc = []) {
  if (!node || typeof node !== "object") return acc;
  acc.push(node);
  const plans = Array.isArray(node.Plans) ? node.Plans : [];
  for (const child of plans) collectPlanNodes(child, acc);
  return acc;
}

function summarizeExplain(rawExplainRows, expectedIndexes) {
  const first = rawExplainRows?.[0]?.["QUERY PLAN"]?.[0];
  const rootPlan = first?.Plan;
  const allNodes = collectPlanNodes(rootPlan);
  const nodeTypes = allNodes.map((node) => node["Node Type"]).filter(Boolean);
  const indexNames = allNodes.map((node) => node["Index Name"]).filter(Boolean);
  const hasIndexScanNode = nodeTypes.some((name) =>
    ["Index Scan", "Index Only Scan", "Bitmap Index Scan", "Bitmap Heap Scan"].includes(name)
  );
  const expectedIndexHit =
    expectedIndexes.length === 0
      ? hasIndexScanNode
      : expectedIndexes.some((name) => indexNames.includes(name));

  return {
    hasIndexScanNode,
    expectedIndexHit,
    nodeTypes,
    indexNames,
  };
}

const queryCases = [
  {
    id: "orders_cursor",
    sql: `
      SELECT "id", "createdAt"
      FROM "AdminOrder"
      WHERE "deletedAt" IS NULL
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 30
    `,
    params: [],
    expectedIndexes: ["AdminOrder_createdAt_idx"],
  },
  {
    id: "orders_public_cursor",
    sql: `
      SELECT "id", "createdAt"
      FROM "AdminOrder"
      WHERE "companionAddress" IS NULL
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 30
    `,
    params: [],
    expectedIndexes: ["AdminOrder_companionAddress_createdAt_id_idx"],
  },
  {
    id: "support_cursor",
    sql: `
      SELECT "id", "createdAt"
      FROM "AdminSupportTicket"
      WHERE "deletedAt" IS NULL
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 30
    `,
    params: [],
    expectedIndexes: ["AdminSupportTicket_createdAt_idx"],
  },
  {
    id: "referral_list",
    sql: `
      SELECT "id", "createdAt"
      FROM "Referral"
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 30
    `,
    params: [],
    expectedIndexes: ["Referral_createdAt_idx"],
  },
  {
    id: "members_cursor",
    sql: `
      SELECT "id", "createdAt"
      FROM "AdminMember"
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 30
    `,
    params: [],
    expectedIndexes: ["AdminMember_createdAt_idx"],
  },
  {
    id: "payment_events_cursor",
    sql: `
      SELECT "id", "createdAt"
      FROM "AdminPaymentEvent"
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 30
    `,
    params: [],
    expectedIndexes: ["AdminPaymentEvent_createdAt_idx"],
  },
];

async function runCase(definition, config) {
  for (let i = 0; i < config.warmup; i += 1) {
    await prisma.$queryRawUnsafe(definition.sql, ...definition.params);
  }

  const latencies = [];
  let sampleRows = 0;
  for (let i = 0; i < config.iterations; i += 1) {
    const start = performance.now();
    const rows = await prisma.$queryRawUnsafe(definition.sql, ...definition.params);
    const elapsed = performance.now() - start;
    latencies.push(elapsed);
    if (i === 0 && Array.isArray(rows)) sampleRows = rows.length;
  }

  const explainRows = await prisma.$queryRawUnsafe(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${definition.sql}`,
    ...definition.params
  );
  const plan = summarizeExplain(explainRows, definition.expectedIndexes);

  return {
    id: definition.id,
    samples: latencies.length,
    sampleRows,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    avg: avg(latencies),
    min: Number(Math.min(...latencies).toFixed(3)),
    max: Number(Math.max(...latencies).toFixed(3)),
    index: {
      hasIndexScanNode: plan.hasIndexScanNode,
      expectedIndexHit: plan.expectedIndexHit,
      expectedIndexes: definition.expectedIndexes,
      actualIndexes: plan.indexNames,
      nodeTypes: plan.nodeTypes,
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();

  const results = [];
  for (const definition of queryCases) {
    const result = await runCase(definition, options);
    results.push(result);
  }

  const report = {
    generatedAt: startedAt,
    iterations: options.iterations,
    warmup: options.warmup,
    results,
  };

  if (options.output) {
    const outputPath = path.resolve(process.cwd(), options.output);
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`wrote baseline report: ${outputPath}`);
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(
    [
      "admin query baseline (ms)",
      "id | p50 | p95 | p99 | avg | index_hit",
      "---|---:|---:|---:|---:|---",
      ...results.map(
        (item) =>
          `${item.id} | ${item.p50.toFixed(3)} | ${item.p95.toFixed(3)} | ${item.p99.toFixed(3)} | ${item.avg.toFixed(3)} | ${item.index.expectedIndexHit ? "yes" : "no"}`
      ),
    ].join("\n")
  );
}

main()
  .catch((error) => {
    console.error("perf baseline failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
