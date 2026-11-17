/**
 * Executa os testes E2E contra uma branch de TESTE do Neon (nunca a main):
 * 1. build do app com as variáveis da branch;
 * 2. Playwright (o webServer sobe `next start`).
 * Argumentos extras vão para o Playwright: `pnpm test:e2e --project=mobile`.
 */
import { execFileSync } from "node:child_process";
import { e2eAppEnv } from "./e2e-config.ts";

const appEnv = e2eAppEnv();
// O mesmo segredo no build e no `next start` (sessões válidas entre os dois).
const env = { ...process.env, ...appEnv, E2E_NEON_AUTH_COOKIE_SECRET: appEnv.NEON_AUTH_COOKIE_SECRET };
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { env, stdio: "inherit" });

try {
  run("pnpm", ["exec", "next", "build"]);
  run("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)]);
} catch {
  process.exit(1);
}
