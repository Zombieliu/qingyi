import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = process.cwd();
const vercelProject = resolve(repoRoot, ".vercel", "project.json");

if (!existsSync(vercelProject)) {
  console.error("未找到 .vercel/project.json，请先在项目根目录执行 `vercel` 进行关联。");
  process.exit(1);
}

const list = spawnSync("vercel", ["env", "ls"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (list.status !== 0) {
  console.error("无法获取环境变量列表：");
  console.error(list.stderr || list.stdout);
  process.exit(list.status ?? 1);
}

const names = new Set();
for (const raw of list.stdout.split("\n")) {
  const line = raw.trim();
  if (!line) continue;
  if (line.startsWith(">") || line.startsWith("name ")) continue;
  if (line.startsWith("Vercel CLI") || line.startsWith("Retrieving")) continue;
  const parts = line.split(/\s{2,}/);
  const name = parts[0]?.trim();
  if (name && name !== "name") names.add(name);
}

if (names.size === 0) {
  console.log("当前项目没有可删除的环境变量。");
  process.exit(0);
}

const targets = ["development", "preview", "production"];
const errors = [];

for (const name of names) {
  for (const env of targets) {
    const rm = spawnSync("vercel", ["--yes", "env", "rm", name, env], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (rm.status !== 0) {
      const combined = `${rm.stdout || ""}\n${rm.stderr || ""}`;
      if (
        /Environment Variable was not found/i.test(combined) ||
        /No Environment Variables/i.test(combined)
      ) {
        continue;
      }
      errors.push({ name, env, details: combined.trim() });
    }
  }
}

if (errors.length) {
  console.error("部分变量删除失败：");
  for (const err of errors) {
    console.error(`- ${err.name} (${err.env})`);
  }
  process.exit(1);
}

console.log("已删除所有环境变量（development/preview/production）。");
