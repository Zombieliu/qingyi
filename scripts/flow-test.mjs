#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
  console.log(`
Usage: node scripts/flow-test.mjs [options]

Options:
  --chain       Run Playwright chain e2e after API checks (if env is ready)
  --ledger      Call /api/ledger/credit (requires E2E_LEDGER_USER + chain env)
  --skip-api    Skip API/admin smoke checks
  --skip-admin  Skip admin API checks
  --all         Run API checks then chain e2e (same as --chain)
  --help, -h    Show this help

Env:
  FLOW_BASE_URL / PLAYWRIGHT_BASE_URL (default http://127.0.0.1:3000)
  ADMIN_DASH_TOKEN or LEDGER_ADMIN_TOKEN (for admin API checks)
  E2E_LEDGER_USER (target address for ledger credit test)
`);
  process.exit(0);
}

const repoRoot = resolve(process.cwd());
loadEnvFile(resolve(repoRoot, ".env.local"));

const baseUrl = new URL(
  process.env.FLOW_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000"
);
const baseURL = baseUrl.toString().replace(/\/$/, "");
const hostname = baseUrl.hostname || "127.0.0.1";
const port = baseUrl.port || "3000";

const runChain = args.has("--chain") || args.has("--all");
const runLedger = args.has("--ledger");
const runApi = !args.has("--skip-api");
const runAdmin = !args.has("--skip-admin");

const warnings = [];
const failures = [];

const log = (msg) => console.log(`[flow] ${msg}`);
const ok = (msg) => console.log(`[flow] OK ${msg}`);
const warn = (msg) => {
  warnings.push(msg);
  console.warn(`[flow] WARN ${msg}`);
};
const fail = (msg) => {
  failures.push(msg);
  console.error(`[flow] FAIL ${msg}`);
};

let serverProcess = null;
let serverStarted = false;

process.on("SIGINT", () => {
  if (serverProcess) serverProcess.kill("SIGTERM");
  process.exit(130);
});

try {
  if (runApi || runLedger) {
    const up = await isServerUp();
    if (!up) {
      serverProcess = startServer();
      serverStarted = true;
      const ready = await waitForServer();
      if (!ready) {
        fail(`server did not start at ${baseURL}`);
        process.exit(1);
      }
      ok(`server ready at ${baseURL}`);
    } else {
      ok(`server already running at ${baseURL}`);
    }
  }

  let orderId = null;

  if (runApi) {
    log("running API smoke checks...");
    const orderRes = await postJson("/api/orders", {
      user: "flow-test-user",
      item: "E2E Test Order",
      amount: 88,
      note: "flow-test",
      status: "已支付",
    });
    if (!orderRes.ok) {
      fail(`POST /api/orders failed: ${orderRes.status} ${orderRes.text}`);
    } else {
      orderId = orderRes.json?.orderId || null;
      if (orderRes.json?.sent === true) {
        ok("orders webhook sent");
      } else if (orderRes.json?.error) {
        warn(`orders webhook skipped: ${orderRes.json.error}`);
      } else {
        ok("orders created");
      }
    }
  }

  if (runApi && runAdmin) {
    const adminSecret = process.env.ADMIN_DASH_TOKEN || process.env.LEDGER_ADMIN_TOKEN || "";
    if (!adminSecret) {
      warn("admin secret missing (ADMIN_DASH_TOKEN/LEDGER_ADMIN_TOKEN), skipping admin checks");
    } else {
      log("running admin API checks...");
      const loginRes = await postJson("/api/admin/login", { token: adminSecret });
      if (!loginRes.ok) {
        fail(`POST /api/admin/login failed: ${loginRes.status} ${loginRes.text}`);
      } else {
        const cookie =
          extractCookie(loginRes.res, "admin_session") ||
          extractCookie(loginRes.res, "admin_token");
        if (!cookie) {
          fail("admin login did not set admin_session cookie");
        } else {
          ok("admin login OK");
          const stats = await getJson("/api/admin/stats", cookie);
          if (stats.ok) ok("admin stats OK");
          else fail(`GET /api/admin/stats failed: ${stats.status} ${stats.text}`);

          const orders = await getJson("/api/admin/orders", cookie);
          if (orders.ok) {
            ok("admin orders list OK");
            const list = Array.isArray(orders.json?.items)
              ? orders.json.items
              : Array.isArray(orders.json)
                ? orders.json
                : [];
            const targetOrder = orderId || list?.[0]?.id;
            if (targetOrder) {
              const patch = await patchJson(`/api/admin/orders/${targetOrder}`, { stage: "已完成" }, cookie);
              if (patch.ok) ok("admin order patched");
              else warn(`order patch failed: ${patch.status} ${patch.text}`);
            } else {
              warn("no admin order found to patch");
            }
          } else {
            fail(`GET /api/admin/orders failed: ${orders.status} ${orders.text}`);
          }

          const ann = await postJson("/api/admin/announcements", {
            title: "Flow Test Announcement",
            content: "flow-test",
            status: "draft",
          }, cookie);
          if (ann.ok && ann.json?.id) {
            ok("admin announcement created");
            const annPatch = await patchJson(`/api/admin/announcements/${ann.json.id}`, { status: "published" }, cookie);
            if (annPatch.ok) ok("admin announcement published");
            else warn(`announcement patch failed: ${annPatch.status} ${annPatch.text}`);
          } else {
            warn(`announcement create failed: ${ann.status} ${ann.text}`);
          }

          const player = await postJson(
            "/api/admin/players",
            { name: "Flow Test Player", status: "可接单" },
            cookie
          );
          if (player.ok && player.json?.id) {
            ok("admin player created");
            const playerPatch = await patchJson(`/api/admin/players/${player.json.id}`, { status: "忙碌" }, cookie);
            if (playerPatch.ok) ok("admin player updated");
            else warn(`player patch failed: ${playerPatch.status} ${playerPatch.text}`);
          } else {
            warn(`player create failed: ${player.status} ${player.text}`);
          }
        }
      }
    }
  }

  if (runLedger) {
    log("running ledger credit check...");
    const missing = [
      "SUI_RPC_URL",
      "SUI_ADMIN_PRIVATE_KEY",
      "SUI_PACKAGE_ID",
      "SUI_DAPP_HUB_ID",
      "SUI_DAPP_HUB_INITIAL_SHARED_VERSION",
      "LEDGER_ADMIN_TOKEN",
    ].filter((key) => !process.env[key]);
    const ledgerUser = process.env.E2E_LEDGER_USER || "";
    if (missing.length) {
      warn(`ledger env missing: ${missing.join(", ")}, skipping ledger credit`);
    } else if (!ledgerUser) {
      warn("E2E_LEDGER_USER not set, skipping ledger credit");
    } else {
      const receiptId = `flow-test-${Date.now()}`;
      const res = await postJson(
        "/api/ledger/credit",
        { user: ledgerUser, amount: "1", receiptId },
        undefined,
        { "x-admin-token": process.env.LEDGER_ADMIN_TOKEN }
      );
      if (res.ok && res.json?.ok) ok("ledger credit OK");
      else fail(`ledger credit failed: ${res.status} ${res.text}`);
    }
  }

  if (runChain) {
    if (serverStarted && serverProcess) {
      log("stopping dev server before chain e2e...");
      serverProcess.kill("SIGTERM");
      serverProcess = null;
      await delay(1000);
    }

    const chainReady =
      process.env.NEXT_PUBLIC_CHAIN_ORDERS === "1" &&
      Boolean(process.env.NEXT_PUBLIC_QY_DEFAULT_COMPANION) &&
      Boolean(process.env.SUI_ADMIN_PRIVATE_KEY || process.env.E2E_SUI_PRIVATE_KEY) &&
      Boolean(process.env.SUI_RPC_URL || process.env.NEXT_PUBLIC_SUI_RPC_URL);

    if (!chainReady) {
      warn("chain env not ready (NEXT_PUBLIC_CHAIN_ORDERS/NEXT_PUBLIC_QY_DEFAULT_COMPANION/SUI_*), skipping chain e2e");
    } else {
      log("running chain e2e (Playwright)...");
      const code = await runCommand("npm", ["run", "test:chain:e2e"], {
        env: {
          ...process.env,
          PW_PROFILE: "chain",
        },
      });
      if (code === 0) ok("chain e2e OK");
      else fail(`chain e2e failed with exit code ${code}`);
    }
  }
} finally {
  if (serverProcess) serverProcess.kill("SIGTERM");
}

if (warnings.length) {
  log(`completed with ${warnings.length} warning(s)`);
}
if (failures.length) {
  log(`completed with ${failures.length} failure(s)`);
  process.exit(1);
}
log("flow checks completed");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function isServerUp() {
  try {
    const res = await fetch(baseURL, { method: "GET" });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerUp()) return true;
    await delay(1_000);
  }
  return false;
}

function startServer() {
  log(`starting dev server at ${baseURL}...`);
  const env = {
    ...process.env,
    E2E_SKIP_WEBHOOK: process.env.E2E_SKIP_WEBHOOK || "1",
  };
  return spawn(
    "npm",
    ["run", "dev", "--workspace", "app", "--", "--hostname", hostname, "--port", port],
    { stdio: "inherit", env }
  );
}

async function runCommand(cmd, cmdArgs, opts = {}) {
  return await new Promise((resolveCode) => {
    const child = spawn(cmd, cmdArgs, { stdio: "inherit", ...opts });
    child.on("close", (code) => resolveCode(code ?? 1));
  });
}

async function postJson(path, body, cookie, extraHeaders = {}) {
  return requestJson("POST", path, body, cookie, extraHeaders);
}

async function patchJson(path, body, cookie) {
  return requestJson("PATCH", path, body, cookie);
}

async function getJson(path, cookie) {
  return requestJson("GET", path, undefined, cookie);
}

async function requestJson(method, path, body, cookie, extraHeaders = {}) {
  const url = path.startsWith("http") ? path : `${baseURL}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (cookie) headers.cookie = cookie;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let res;
  let text = "";
  let json = null;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    text = await res.text();
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
  } catch (err) {
    return { ok: false, status: 0, text: String(err), json: null, res: null };
  } finally {
    clearTimeout(timeout);
  }
  return { ok: res.ok, status: res.status, text, json, res };
}

function extractCookie(res, name) {
  if (!res) return "";
  const raw = res.headers.get("set-cookie") || "";
  if (!raw) return "";
  const parts = raw.split(";")[0];
  if (!parts.startsWith(`${name}=`)) return parts;
  return parts;
}
