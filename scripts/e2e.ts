/**
 * Executa os testes E2E contra a pilha Supabase LOCAL (nunca o projeto real):
 * 1. build do app com as variáveis da pilha local;
 * 2. Playwright (o webServer sobe a pilha + `next start`).
 * Argumentos extras vão para o Playwright: `pnpm test:e2e --project=mobile`.
 */
import { execFileSync } from "node:child_process";
import { LOCAL_APP_ENV } from "./local-stack-config.ts";

const env = { ...process.env, ...LOCAL_APP_ENV };
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { env, stdio: "inherit" });

try {
  run("pnpm", ["exec", "next", "build"]);
  run("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)]);
} catch {
  process.exit(1);
}
