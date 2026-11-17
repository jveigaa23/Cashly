/**
 * Configuração dos testes E2E. O login é o Neon Auth de verdade (serviço
 * gerenciado, sem versão local), então os testes rodam contra uma BRANCH de
 * teste do Neon — nunca a `main`. Crie uma branch (Console → Branches →
 * "e2e", a partir da main) e exporte as URLs dela:
 *
 *   E2E_NEON_AUTH_BASE_URL=https://ep-...neonauth.../cashly/auth
 *   E2E_NEON_DATA_API_URL=https://ep-...apirest.../cashly/rest/v1
 *
 * As contas criadas pelos testes ficam nessa branch (dados descartáveis:
 * apague e recrie a branch quando quiser limpar).
 */
import { randomBytes } from "node:crypto";

export const E2E_APP_PORT = 3100;
export const E2E_SITE_URL = `http://localhost:${E2E_APP_PORT}`;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Defina ${name} com a URL de uma branch de TESTE do Neon (veja scripts/e2e-config.ts).`);
  }
  return value.replace(/\/$/, "");
}

export function e2eNeon() {
  return { authUrl: required("E2E_NEON_AUTH_BASE_URL"), dataApiUrl: required("E2E_NEON_DATA_API_URL") };
}

/** Variáveis para o app apontar para a branch de teste. */
export function e2eAppEnv(): Record<string, string> {
  const { authUrl, dataApiUrl } = e2eNeon();
  return {
    NEON_AUTH_BASE_URL: authUrl,
    NEON_DATA_API_URL: dataApiUrl,
    NEON_AUTH_COOKIE_SECRET: process.env.E2E_NEON_AUTH_COOKIE_SECRET ?? randomBytes(32).toString("base64"),
    NEXT_PUBLIC_SITE_URL: E2E_SITE_URL,
    // Testes não dependem do serviço externo de senhas vazadas.
    PASSWORD_LEAK_CHECK: "off",
    // Vínculo do app Android (valores de teste; o certificado real vem do PWABuilder).
    ANDROID_PACKAGE_NAME: "app.cashly.teste",
    ANDROID_CERT_SHA256: Array.from({ length: 32 }, () => "AB").join(":"),
  };
}
