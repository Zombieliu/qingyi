import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = process.cwd();
const args = process.argv.slice(2);

function getArgValue(flag, shortFlag) {
  for (let i = 0; i < args.length; i += 1) {
    const item = args[i];
    if (item === flag || (shortFlag && item === shortFlag)) {
      return args[i + 1];
    }
    if (item.startsWith(`${flag}=`)) {
      return item.slice(flag.length + 1);
    }
  }
  return "";
}

function hasFlag(flag, shortFlag) {
  return args.includes(flag) || (shortFlag ? args.includes(shortFlag) : false);
}

const newToken = process.env.SENTRY_AUTH_TOKEN_NEW || getArgValue("--new", "-n");
const oldToken = process.env.SENTRY_AUTH_TOKEN_OLD || getArgValue("--old", "-o");
const envTargets = getArgValue("--env", "-e") || "development,preview,production";
const dryRun = hasFlag("--dry-run");

const vercelProject = resolve(repoRoot, ".vercel", "project.json");
if (!existsSync(vercelProject)) {
  console.error("未找到 .vercel/project.json，请先在项目根目录执行 `vercel` 进行关联。");
  process.exit(1);
}

if (!newToken) {
  console.error("缺少新 token。请设置 SENTRY_AUTH_TOKEN_NEW 或通过 --new 传入。");
  process.exit(1);
}

const targets = envTargets
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

if (!targets.length) {
  console.error("未指定有效的环境（development/preview/production）。");
  process.exit(1);
}

const errors = [];
for (const env of targets) {
  if (dryRun) {
    console.log(`[dry-run] set SENTRY_AUTH_TOKEN -> ${env}`);
    continue;
  }
  const rm = spawnSync("vercel", ["--yes", "env", "rm", "SENTRY_AUTH_TOKEN", env], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (rm.status !== 0) {
    const combined = `${rm.stdout || ""}\n${rm.stderr || ""}`;
    if (!/Environment Variable was not found|No Environment Variables/i.test(combined)) {
      errors.push({ env, step: "rm", details: combined.trim() });
      continue;
    }
  }
  const add = spawnSync("vercel", ["--yes", "env", "add", "SENTRY_AUTH_TOKEN", env], {
    encoding: "utf8",
    input: `${newToken}\n`,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (add.status !== 0) {
    const combined = `${add.stdout || ""}\n${add.stderr || ""}`;
    errors.push({ env, step: "add", details: combined.trim() });
  }
}

if (errors.length) {
  console.error("SENTRY_AUTH_TOKEN 更新失败：");
  for (const err of errors) {
    console.error(`- ${err.env} [${err.step}]`);
  }
  process.exit(1);
}

console.log(`已更新 SENTRY_AUTH_TOKEN（${targets.join(", ")}）。`);
if (oldToken) {
  console.log("提示：请在 Sentry 控制台中手动撤销旧 token。当前脚本不会自动吊销旧 token。");
}
