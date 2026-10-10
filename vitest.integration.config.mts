import { defineConfig } from "vitest/config";

// Integração: supabase-js + PostgREST real + PostgreSQL temporário (isolado).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/integration/global-setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
