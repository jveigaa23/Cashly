import { z } from "zod";

/**
 * Variáveis públicas (vão para o navegador). Validadas na primeira leitura:
 * configuração ausente gera erro explícito, nunca um app "funcionando" sem banco.
 * Referências literais a process.env.NEXT_PUBLIC_* são necessárias para o Next
 * embutir os valores no bundle do cliente.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.url({ protocol: /^https?$/ }),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cached: PublicEnv | undefined;

export function publicEnv(): PublicEnv {
  if (cached) return cached;
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuração ausente ou inválida: ${missing}. Veja .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
