import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
      include: ["lib/**", "app/api/**"],
      exclude: ["node_modules", ".next"],
    },
    alias: {
      // Next.js server-only guard: no-op in test environment
      "server-only": path.resolve(__dirname, "tests/__mocks__/server-only.ts"),
      // next/headers and next/navigation are not available in Node test env
      "next/headers": path.resolve(__dirname, "tests/__mocks__/next-headers.ts"),
      "next/navigation": path.resolve(__dirname, "tests/__mocks__/next-navigation.ts"),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
