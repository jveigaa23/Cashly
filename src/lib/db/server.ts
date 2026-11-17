import "server-only";
import { PostgrestClient } from "@supabase/postgrest-js";
import { connection } from "next/server";
import { cache } from "react";
import { auth } from "@/lib/auth/server";
import { serverEnv } from "@/lib/server-env";
import type { Database } from "./database.types";

export type DbClient = PostgrestClient<Database>;

/**
 * JWT da sessão atual (Neon Auth, EdDSA, 15 min), pedido uma vez por
 * requisição. Sem sessão: null, e o Data API trata a chamada como "anonymous",
 * papel que não tem privilégio em nenhuma tabela.
 */
const sessionJwt = cache(async (): Promise<string | null> => {
  // O tipo de token() no SDK é genérico demais; o retorno é { data: { token } }.
  type TokenApi = { token: () => Promise<{ data: { token?: unknown } | null; error: unknown }> };
  const { data, error } = await (auth() as unknown as TokenApi).token();
  const token = data?.token;
  return !error && typeof token === "string" && token ? token : null;
});

/**
 * Cliente do banco com a identidade de quem está logado. Fala com o Neon Data
 * API (PostgREST): o banco valida o JWT e aplica o RLS com auth.uid().
 * Nenhuma credencial privilegiada é usada aqui.
 */
export async function createClient(): Promise<DbClient> {
  // A sessão depende de cookies e do relógio: nunca durante a pré-renderização.
  await connection();
  const token = await sessionJwt();
  return new PostgrestClient<Database>(serverEnv().NEON_DATA_API_URL, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
  });
}
