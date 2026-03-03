function unsupported(name) {
  throw new Error(`node:child_process.${name} is not supported in Cloudflare Workers`);
}

export function spawn() {
  unsupported("spawn");
}

export function spawnSync() {
  unsupported("spawnSync");
}

export function exec() {
  unsupported("exec");
}

export function execSync() {
  unsupported("execSync");
}

export function execFile() {
  unsupported("execFile");
}

export function execFileSync() {
  unsupported("execFileSync");
}

export function fork() {
  unsupported("fork");
}

export default {
  spawn,
  spawnSync,
  exec,
  execSync,
  execFile,
  execFileSync,
  fork,
};
