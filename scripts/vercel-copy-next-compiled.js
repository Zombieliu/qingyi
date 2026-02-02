const fs = require("fs");
const path = require("path");

const root = process.cwd();
const appDir = path.join(root, "packages", "app");
const standaloneDir = path.join(appDir, ".next", "standalone");
const nextCompiled = path.join(root, "node_modules", "next", "dist", "compiled");
const target = path.join(standaloneDir, "node_modules", "next", "dist", "compiled");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
  return true;
}

if (!fs.existsSync(standaloneDir)) {
  console.log("standalone dir not found, skip copy");
  process.exit(0);
}

const ok = copyDir(nextCompiled, target);
if (ok) {
  console.log("Copied next/dist/compiled into standalone.");
} else {
  console.log("next/dist/compiled not found, skip copy");
}
