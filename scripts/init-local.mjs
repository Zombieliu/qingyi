#!/usr/bin/env node
import { spawn } from "node:child_process";

const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://qingyi:qingyi@localhost:5432/qingyi?schema=public";

async function run(cmd, args, env = {}) {
  return await new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function main() {
  let code = await run("docker", ["compose", "up", "-d"]);
  if (code !== 0) process.exit(code);

  code = await run("npm", ["run", "db:deploy", "--workspace", "app"], {
    DATABASE_URL: databaseUrl,
  });
  if (code !== 0) {
    await run(
      "npx",
      [
        "prisma",
        "migrate",
        "resolve",
        "--schema",
        "packages/app/prisma/schema.prisma",
        "--applied",
        "20260201_init_admin_store",
      ],
      { DATABASE_URL: databaseUrl }
    );
    code = await run("npm", ["run", "db:deploy", "--workspace", "app"], {
      DATABASE_URL: databaseUrl,
    });
    if (code !== 0) process.exit(code);
  }

  code = await run("npm", ["run", "db:seed", "--workspace", "app"], {
    DATABASE_URL: databaseUrl,
  });
  process.exit(code ?? 0);
}

main();
