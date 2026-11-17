import "server-only";
import { z } from "zod";

/**
 * Variáveis do servidor (nunca vão para o navegador). Validadas na primeira
 * leitura: configuração ausente gera erro explícito, nunca um app "funcionando"
 * sem banco ou sem login.
 */
const serverSchema = z.object({
  /** Neon Auth (Better Auth gerenciado): Console → Auth → Configuration. */
  NEON_AUTH_BASE_URL: z.url({ protocol: /^https?$/ }),
  /** Assina o cookie de cache da sessão (HMAC). 32+ caracteres aleatórios. */
  NEON_AUTH_COOKIE_SECRET: z.string().min(32),
  /** Neon Data API (PostgREST): Console → Data API. Termina em /rest/v1. */
  NEON_DATA_API_URL: z.url({ protocol: /^https?$/ }),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse({
    NEON_AUTH_BASE_URL: process.env.NEON_AUTH_BASE_URL,
    NEON_AUTH_COOKIE_SECRET: process.env.NEON_AUTH_COOKIE_SECRET,
    NEON_DATA_API_URL: process.env.NEON_DATA_API_URL,
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuração ausente ou inválida: ${missing}. Veja .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
