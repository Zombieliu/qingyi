import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    locale: "zh-CN",
    colorScheme: "light",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev --workspace app -- --hostname 127.0.0.1 --port 3000",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "Desktop Chrome",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "Desktop Edge",
      use: {
        ...devices["Desktop Edge"],
        browserName: "chromium",
      },
    },
    { name: "iPhone 15 Pro", use: { ...devices["iPhone 15 Pro"], browserName: "webkit" } },
    { name: "iPhone SE (3rd gen)", use: { ...devices["iPhone SE (3rd gen)"], browserName: "webkit" } },
    { name: "Pixel 7", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "Pixel 5", use: { ...devices["Pixel 5"], browserName: "chromium" } },
    { name: "iPad Pro 11", use: { ...devices["iPad Pro 11"], browserName: "webkit" } },
    { name: "iPad (gen 11)", use: { ...devices["iPad (gen 11)"], browserName: "webkit" } },
  ],
});
