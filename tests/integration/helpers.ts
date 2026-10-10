import { createHmac, randomUUID } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { inject } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

/** JWT HS256 como os do Supabase Auth (sub, email, role). */
export function signJwt(claims: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims }));
  const signature = createHmac("sha256", inject("jwtSecret")).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export interface ItUser {
  id: string;
  email: string;
  name: string;
}

let admin: Client | undefined;
export async function adminDb(): Promise<Client> {
  if (!admin) {
    admin = new Client({ host: "127.0.0.1", port: inject("itPgPort"), user: "postgres", database: "cashly_it" });
    await admin.connect();
  }
  return admin;
}

export async function closeAdminDb() {
  await admin?.end();
  admin = undefined;
}

export async function createItUser(name = "Pessoa"): Promise<ItUser> {
  const email = `${randomUUID()}@exemplo.test`;
  const db = await adminDb();
  const { rows } = await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [email]);
  return { id: rows[0].id, email, name };
}

/** Cliente supabase-js autenticado como o usuário, contra o PostgREST local. */
export function clientFor(user: ItUser) {
  const token = signJwt({ sub: user.id, email: user.email, role: "authenticated", user_metadata: { display_name: user.name } });
  return createSupabaseClient<Database>(inject("restUrl"), "chave-publica-de-teste", {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient() {
  return createSupabaseClient<Database>(inject("restUrl"), "chave-publica-de-teste", {
    global: { headers: { Authorization: `Bearer ${signJwt({ role: "anon" })}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
