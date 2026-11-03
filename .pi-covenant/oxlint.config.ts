import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  env: { ...core.env, node: true },
  extends: [core, vitest],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    ".covenant/**",
    "vendor/**",
    ".agents/**",
  ],
  overrides: [
    {
      files: ["src/**/*.test.ts"],
      plugins: ["vitest"],
      rules: {
        // Lifecycle assertions and polling must observe ordered filesystem effects.
        "no-await-in-loop": "off",
        "unicorn/no-await-expression-member": "off",
        "vitest/max-expects": ["error", { max: 15 }],
        "vitest/no-standalone-expect": [
          "error",
          { additionalTestBlockFunctions: ["contractTest"] },
        ],
        "vitest/valid-expect": ["error", { maxArgs: 2 }],
      },
    },
  ],
  rules: {
    "func-style": ["error", "declaration", { allowArrowFunctions: true }],
    "unicorn/import-style": [
      "error",
      { styles: { "node:path": { named: true } } },
    ],
  },
});
