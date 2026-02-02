import { test, expect } from "@playwright/test";

const routes = [
  { name: "login", path: "/" },
  { name: "home", path: "/home" },
  { name: "showcase", path: "/showcase" },
  { name: "schedule", path: "/schedule" },
  { name: "wallet", path: "/wallet" },
  { name: "vip", path: "/vip" },
  { name: "me", path: "/me" },
  { name: "news", path: "/news" },
];

const passkeyStub = {
  address: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd",
  publicKey: "dGVzdC1wdWJsaWMta2V5",
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as typeof window & { __PW_VISUAL_TEST__?: boolean }).__PW_VISUAL_TEST__ = true;
  });

  await page.addInitScript((value) => {
    window.localStorage.setItem("qy_passkey_wallet_v3", JSON.stringify(value));
  }, passkeyStub);

  await page.addInitScript(() => {
    window.localStorage.setItem("dl_orders", JSON.stringify([]));
  });

  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.innerHTML = "*, *::before, *::after { animation: none !important; transition: none !important; }";
    document.documentElement.appendChild(style);
  });
});

for (const route of routes) {
  test(`visual ${route.name}`, async ({ page }) => {
    await page.goto(route.path, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot(`${route.name}.png`, { fullPage: true });
  });
}
