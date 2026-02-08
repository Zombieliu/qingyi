const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeClientIp,
  isIpAllowed,
  isIpv4InCidr,
} = require("../packages/app/src/lib/admin-ip-utils.js");

test("normalizeClientIp strips ports and brackets", () => {
  assert.equal(normalizeClientIp("203.0.113.9:443"), "203.0.113.9");
  assert.equal(normalizeClientIp("[2001:db8::1]:443"), "2001:db8::1");
});

test("isIpv4InCidr matches cidr ranges", () => {
  assert.equal(isIpv4InCidr("10.0.0.5", "10.0.0.0/24"), true);
  assert.equal(isIpv4InCidr("10.0.1.5", "10.0.0.0/24"), false);
});

test("isIpAllowed respects allowlist", () => {
  assert.equal(isIpAllowed("1.2.3.4", ""), true);
  assert.equal(isIpAllowed("1.2.3.4", "1.2.3.4"), true);
  assert.equal(isIpAllowed("1.2.3.4", "5.6.7.8"), false);
  assert.equal(isIpAllowed("10.0.0.5", "10.0.0.0/24"), true);
  assert.equal(isIpAllowed("10.0.1.5", "10.0.0.0/24"), false);
  assert.equal(isIpAllowed("2001:db8::1", "2001:db8::1"), true);
  assert.equal(isIpAllowed("8.8.8.8", "*"), true);
  assert.equal(isIpAllowed("unknown", "1.2.3.4"), false);
});
