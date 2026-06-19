import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "workers",
          include: ["src/**/*.test.ts"],
          exclude: ["src/__tests__/versification.test.ts"],
        },
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.toml" },
          }),
        ],
      },
      {
        extends: true,
        test: {
          name: "node",
          include: ["src/__tests__/versification.test.ts"],
          environment: "node",
          execArgv: ["--experimental-sqlite"],
        },
      },
    ],
  },
});