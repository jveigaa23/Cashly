import "server-only";
import { createNeonAuth, type NeonAuth } from "@neon/auth/next/server";
import { serverEnv } from "@/lib/server-env";

/**
 * Neon Auth (Better Auth gerenciado). Sessão em cookie HTTP-only; o servidor
 * do Next conversa com o serviço de autenticação, o navegador nunca fala com ele
 * diretamente (CSP connect-src 'self').
 *
 * sameSite "lax": quem abre o Cashly por um link (e-mail, WhatsApp) continua
 * logado; "strict" faria a primeira página parecer deslogada.
 */
let instance: NeonAuth | undefined;

export function auth(): NeonAuth {
  if (instance) return instance;
  const env = serverEnv();
  instance = createNeonAuth({
    baseUrl: env.NEON_AUTH_BASE_URL,
    cookies: { secret: env.NEON_AUTH_COOKIE_SECRET, sameSite: "lax" },
    logLevel: "error",
  });
  return instance;
}
