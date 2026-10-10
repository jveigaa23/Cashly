import { defineConfig, devices } from "@playwright/test";
import { LOCAL_APP_PORT } from "./scripts/local-stack-config";

// Permite interceptar a rede do Service Worker (necessário para simular
// falta de conexão: `setOffline` não se aplica às requisições do SW).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";

// Sempre contra a pilha Supabase LOCAL e isolada (scripts/local-stack.ts).
const baseURL = `http://localhost:${LOCAL_APP_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [
    // Celular de tela pequena (360px) — público principal.
    {
      name: "mobile",
      use: { ...devices["Galaxy S9+"], viewport: { width: 360, height: 740 } },
    },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  // Build de produção (SW ativo) feito por scripts/e2e.ts com as variáveis
  // da pilha local; aqui sobem a pilha (Postgres + Auth + REST) e o app.
  webServer: {
    command: "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/local-stack.ts --app",
    url: `${baseURL}/entrar`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
