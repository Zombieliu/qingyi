import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["**/*.integration.test.ts", "**/node_modules/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      include: [
        "src/lib/**/*.ts",
        "src/app/api/**/*.ts",
        "src/app/components/**/*.tsx",
        "src/components/ui/**/*.tsx",
      ],
      exclude: [
        "src/**/*.d.ts",
        "src/test/**",
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/*.spec.ts",
        "src/**/*.integration.test.ts",
        "src/lib/db.ts",
        "src/lib/env.ts",
        "src/lib/admin/admin-types.ts",
        "src/lib/chain/dubhe.ts",
      ],
      thresholds: {
        statements: 95,
        branches: 85,
        functions: 90,
        lines: 95,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/__mocks__/server-only.ts"),
    },
  },
});
