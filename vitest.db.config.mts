import { defineConfig } from "vitest/config";

// Testes de banco (migrações, RLS, funções) contra um PostgreSQL temporário.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    globalSetup: ["./tests/db/global-setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
