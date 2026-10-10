/**
 * Configuração FIXA da pilha local de testes (nunca usar em produção).
 * Fixa porque as variáveis NEXT_PUBLIC_* são embutidas no build.
 */
import { createHmac } from "node:crypto";

export const LOCAL_GATEWAY_PORT = 54321;
export const LOCAL_SUPABASE_URL = `http://127.0.0.1:${LOCAL_GATEWAY_PORT}`;
export const LOCAL_APP_PORT = 3100;
export const LOCAL_SITE_URL = `http://localhost:${LOCAL_APP_PORT}`;
export const LOCAL_JWT_SECRET = "cashly-pilha-local-de-testes-segredo-nao-usar-em-producao";

function sign(payload: Record<string, unknown>): string {
  const b64 = (v: string) => Buffer.from(v).toString("base64url");
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify(payload));
  return `${head}.${body}.${createHmac("sha256", LOCAL_JWT_SECRET).update(`${head}.${body}`).digest("base64url")}`;
}

// Chave "anon" equivalente à publishable do Supabase (determinística).
export const LOCAL_ANON_KEY = sign({ iss: "cashly-local", role: "anon", iat: 1760000000, exp: 4102444800 });
export const LOCAL_SERVICE_KEY = sign({ iss: "cashly-local", role: "service_role", iat: 1760000000, exp: 4102444800 });

/** Variáveis para o app apontar para a pilha local. */
export const LOCAL_APP_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: LOCAL_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: LOCAL_SITE_URL,
  // Testes não dependem do serviço externo de senhas vazadas.
  PASSWORD_LEAK_CHECK: "off",
};
