import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

const envFile = getArgValue("--file", "-f") || ".env";
const envTargets = getArgValue("--env", "-e") || "development,preview,production";
const dryRun = hasFlag("--dry-run");
const allowEmpty = hasFlag("--allow-empty");

const filePath = resolve(repoRoot, envFile);
const vercelProject = resolve(repoRoot, ".vercel", "project.json");

if (!existsSync(vercelProject)) {
  console.error("未找到 .vercel/project.json，请先在项目根目录执行 `vercel` 进行关联。");
  process.exit(1);
}

if (!existsSync(filePath)) {
  console.error(`未找到 ${envFile}，请确认路径或使用 --file 指定。`);
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

const content = readFileSync(filePath, "utf8");
const entries = new Map();

for (const rawLine of content.split(/\r?\n/)) {
  let line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  if (line.startsWith("export ")) line = line.slice("export ".length);
  const idx = line.indexOf("=");
  if (idx <= 0) continue;
  const key = line.slice(0, idx).trim();
  let value = line.slice(idx + 1).trim();
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (!allowEmpty && value === "") continue;
  if (key) entries.set(key, value);
}

if (entries.size === 0) {
  console.log("未读取到任何环境变量，已退出。若需要同步空值，请添加 --allow-empty。");
  process.exit(0);
}

const errors = [];

for (const [key, value] of entries.entries()) {
  for (const env of targets) {
    if (dryRun) {
      console.log(`[dry-run] set ${key} -> ${env}`);
      continue;
    }

    const rm = spawnSync("vercel", ["--yes", "env", "rm", key, env], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (rm.status !== 0) {
      const combined = `${rm.stdout || ""}\n${rm.stderr || ""}`;
      if (!/Environment Variable was not found|No Environment Variables/i.test(combined)) {
        errors.push({ key, env, step: "rm", details: combined.trim() });
        continue;
      }
    }

    const add = spawnSync("vercel", ["--yes", "env", "add", key, env], {
      encoding: "utf8",
      input: `${value}\n`,
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (add.status !== 0) {
      const combined = `${add.stdout || ""}\n${add.stderr || ""}`;
      errors.push({ key, env, step: "add", details: combined.trim() });
    }
  }
}

if (errors.length) {
  console.error("部分变量同步失败：");
  for (const err of errors) {
    console.error(`- ${err.key} (${err.env}) [${err.step}]`);
  }
  process.exit(1);
}

console.log(`已同步 ${entries.size} 个变量到 ${targets.join(", ")}。`);
