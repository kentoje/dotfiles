import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    hookTimeout: 10_000,
    include: ["src/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
