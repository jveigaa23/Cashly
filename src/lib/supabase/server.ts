import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Cliente Supabase do servidor com a sessão do usuário (cookies).
 * Usa a chave pública: todas as consultas passam pelo RLS do banco.
 * A chave service_role NUNCA é usada aqui.
 */
export async function createClient() {
  const cookieStore = await cookies();
  // O cliente de Auth lê o relógio (Date.now) ao validar o token; com Cache
  // Components isso não pode acontecer durante a pré-renderização. Dados da
  // família são sempre por requisição.
  await connection();
  const env = publicEnv();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chamado de um Server Component: o proxy já renova a sessão.
          }
        },
      },
    },
  );
}
