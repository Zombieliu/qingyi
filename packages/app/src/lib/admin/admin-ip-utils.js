import net from "net";

function normalizeClientIp(raw) {
  let ip = String(raw || "").trim();
  if (!ip) return "unknown";
  if (ip.startsWith("[")) {
    const end = ip.indexOf("]");
    if (end > 0) {
      ip = ip.slice(1, end);
    }
  } else if (ip.includes(":") && ip.includes(".")) {
    ip = ip.split(":")[0];
  }
  return ip;
}

function parseAllowlist(raw) {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function ipv4ToInt(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) >>> 0) + (nums[1] << 16) + (nums[2] << 8) + nums[3];
}

function isIpv4InCidr(ip, cidr) {
  const [base, maskRaw] = cidr.split("/");
  const mask = Number(maskRaw);
  if (!Number.isInteger(mask) || mask < 0 || mask > 32) return false;
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null) return false;
  const bitmask = mask === 0 ? 0 : (0xffffffff << (32 - mask)) >>> 0;
  return (ipInt & bitmask) === (baseInt & bitmask);
}

function isIpAllowed(ip, rawAllowlist) {
  const entries = parseAllowlist(rawAllowlist);
  if (entries.length === 0) return true;
  if (!ip || ip === "unknown") return false;
  const version = net.isIP(ip);
  for (const entry of entries) {
    if (entry === "*") return true;
    if (entry.includes("/")) {
      if (version === 4 && isIpv4InCidr(ip, entry)) return true;
      continue;
    }
    if (entry === ip) return true;
  }
  return false;
}

export { normalizeClientIp, parseAllowlist, ipv4ToInt, isIpv4InCidr, isIpAllowed };
