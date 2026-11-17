import { defineConfig } from "vitest/config";

// Integração: postgrest-js + PostgREST real + PostgreSQL temporário (isolado).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/integration/global-setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    // O SDK do Neon Auth importa "next/headers" sem extensão; processado pelo
    // Vite, o import resolve como no Next.
    server: { deps: { inline: ["@neon/auth"] } },
  },
});
