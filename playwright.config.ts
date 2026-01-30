import { defineConfig, devices, type Project } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const profile = process.env.PW_PROFILE || "full";

const mobileUse = { isMobile: true, hasTouch: true };
const bp = (name: string, width: number, height: number, use: Project["use"] = {}): Project => ({
  name: `Breakpoint - ${name} ${width}x${height}`,
  use: {
    browserName: "chromium",
    viewport: { width, height },
    ...use,
  },
});

// 断点优先：先覆盖关键宽度，再用设备做验证
const coreBreakpoints: Project[] = [
  bp("Mobile SE", 375, 667, mobileUse),
  bp("Mobile Standard", 390, 844, mobileUse),
  bp("Mobile Android", 412, 915, mobileUse),
  bp("Desktop 1080p", 1920, 1080),
];

const fullBreakpoints: Project[] = [
  bp("Mobile Pro", 402, 874, mobileUse),
  // iPhone 17 Air (2025) new size
  bp("Mobile Air", 420, 912, mobileUse),
  // iPhone 17 Pro Max (2025) new size
  bp("Mobile Pro Max", 440, 956, mobileUse),
  // iPhone 15/16 Pro Max & 16 Plus
  bp("Mobile Plus/Max", 430, 932, mobileUse),
  bp("Android Standard", 360, 780, mobileUse),
  bp("Fold Outer", 361, 882, mobileUse),
  bp("Fold Inner", 695, 874, mobileUse),
  bp("Tablet Portrait", 768, 1024),
  bp("Tablet Landscape", 1024, 768),
  bp("Desktop 1366", 1366, 768),
  bp("Desktop 1440", 1440, 900),
  bp("Desktop 2K", 2560, 1440),
  bp("Desktop Ultrawide", 3440, 1440),
];

const coreDevices: Project[] = [
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
    name: "Tablet Safari - iPad Pro 11",
    use: { ...devices["iPad Pro 11"], browserName: "webkit" },
  },
];

const fullDevices: Project[] = [
  {
    name: "Mobile Safari - iPhone 17",
    use: {
      browserName: "webkit",
      viewport: { width: 402, height: 874 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    },
  },
  {
    name: "Mobile Safari - iPhone 17 Pro",
    use: {
      browserName: "webkit",
      viewport: { width: 402, height: 874 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    },
  },
  {
    name: "Mobile Safari - iPhone 17 Air",
    use: {
      browserName: "webkit",
      viewport: { width: 420, height: 912 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    },
  },
  {
    name: "Mobile Safari - iPhone 17 Pro Max",
    use: {
      browserName: "webkit",
      viewport: { width: 440, height: 956 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    },
  },
  { name: "Mobile Safari - iPhone 14", use: { ...devices["iPhone 14"], browserName: "webkit" } },
  { name: "Mobile Safari - iPhone 13", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  { name: "Mobile Safari - iPhone 12", use: { ...devices["iPhone 12"], browserName: "webkit" } },
  { name: "Small Mobile Safari - iPhone SE", use: { ...devices["iPhone SE"], browserName: "webkit" } },
  { name: "Mobile Chrome - Galaxy S24", use: { ...devices["Galaxy S24"], browserName: "chromium" } },
  { name: "Mobile Chrome - Galaxy S8", use: { ...devices["Galaxy S8"], browserName: "chromium" } },
  { name: "Desktop Safari", use: { ...devices["Desktop Safari"], browserName: "webkit" } },
  { name: "Desktop Firefox", use: { ...devices["Desktop Firefox"], browserName: "firefox" } },
];

const compatProjects: Project[] = [
  { name: "Small Mobile Safari - iPhone SE", use: { ...devices["iPhone SE"], browserName: "webkit" } },
  { name: "Mobile Chrome - Galaxy S8", use: { ...devices["Galaxy S8"], browserName: "chromium" } },
  { name: "Desktop Firefox", use: { ...devices["Desktop Firefox"], browserName: "firefox" } },
];

const projectsByProfile: Record<string, Project[]> = {
  core: [...coreBreakpoints, ...coreDevices],
  full: [...coreBreakpoints, ...fullBreakpoints, ...coreDevices, ...fullDevices],
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
