import { defineConfig, devices, type Project } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const profile = process.env.PW_PROFILE || "full";

const coreProjects: Project[] = [
  {
    name: "Mobile Safari - iPhone 15",
    use: { ...devices["iPhone 15"], browserName: "webkit" },
  },
  {
    // Playwright 未内置 Pixel 8/9，使用 Pixel 7 作为近似主流尺寸基准
    name: "Mobile Chrome - Pixel 7",
    use: { ...devices["Pixel 7"], browserName: "chromium" },
  },
  {
    name: "Desktop Chrome",
    use: {
      ...devices["Desktop Chrome"],
      browserName: "chromium",
      viewport: { width: 1440, height: 900 },
    },
  },
];

const regressionProjects: Project[] = [
  { name: "Mobile Safari - iPhone 14", use: { ...devices["iPhone 14"], browserName: "webkit" } },
  { name: "Mobile Safari - iPhone 13", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  { name: "Mobile Safari - iPhone 12", use: { ...devices["iPhone 12"], browserName: "webkit" } },
  { name: "Small Mobile - iPhone SE", use: { ...devices["iPhone SE"], browserName: "webkit" } },
  {
    name: "Tablet - iPad Pro 11 landscape",
    use: { ...devices["iPad Pro 11 landscape"], browserName: "webkit" },
  },
  { name: "Mobile Chrome - Galaxy S24", use: { ...devices["Galaxy S24"], browserName: "chromium" } },
  { name: "Mobile Chrome - Galaxy S8", use: { ...devices["Galaxy S8"], browserName: "chromium" } },
  { name: "Desktop Safari", use: { ...devices["Desktop Safari"], browserName: "webkit" } },
  { name: "Desktop Firefox", use: { ...devices["Desktop Firefox"], browserName: "firefox" } },
];

const compatProjects: Project[] = [
  { name: "Small Mobile - iPhone SE", use: { ...devices["iPhone SE"], browserName: "webkit" } },
  { name: "Mobile Chrome - Galaxy S8", use: { ...devices["Galaxy S8"], browserName: "chromium" } },
  { name: "Desktop Firefox", use: { ...devices["Desktop Firefox"], browserName: "firefox" } },
];

const projectsByProfile: Record<string, Project[]> = {
  core: coreProjects,
  full: [...coreProjects, ...regressionProjects],
  compat: compatProjects,
};

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
  projects: projectsByProfile[profile] ?? projectsByProfile.full,
});
