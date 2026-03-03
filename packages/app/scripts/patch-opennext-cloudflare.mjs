import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const patchRoot = path.join(__dirname, "opennext-cloudflare-patches");
const targetDistRoot = path.resolve(
  __dirname,
  "../../../node_modules/@opennextjs/cloudflare/dist"
);

const patchedFiles = [
  "cli/build/open-next/createServerBundle.js",
  "cli/build/bundle-server.js",
  "cli/templates/shims/child-process.js",
  "cli/templates/shims/child-process.d.ts",
  "cli/templates/shims/tty.js",
  "cli/templates/shims/tty.d.ts",
  "cli/templates/shims/vm.js",
  "cli/templates/shims/vm.d.ts",
];

if (!fs.existsSync(targetDistRoot)) {
  console.warn(
    `[opennext-patch] Skip: target not found at ${targetDistRoot}. Did you run pnpm install?`
  );
  process.exit(0);
}

for (const relativeFile of patchedFiles) {
  const source = path.join(patchRoot, relativeFile);
  const target = path.join(targetDistRoot, relativeFile);

  if (!fs.existsSync(source)) {
    throw new Error(`[opennext-patch] Missing patch source: ${source}`);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

console.log(`[opennext-patch] Applied ${patchedFiles.length} Cloudflare compatibility patches.`);
