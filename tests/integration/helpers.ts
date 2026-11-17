import { createHmac, randomUUID } from "node:crypto";
import { PostgrestClient } from "@supabase/postgrest-js";
import { Client } from "pg";
import { inject } from "vitest";
import type { Database } from "@/lib/db/database.types";

const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

/** JWT de teste (HS256) com as claims que o Neon Auth envia (sub, email, role). */
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
  const { rows } = await db.query<{ id: string }>(`insert into neon_auth."user" (email, name) values ($1, $2) returning id`, [email, name]);
  return { id: rows[0].id, email, name };
}

/** Cliente do Data API autenticado como o usuário, contra o PostgREST local. */
export function clientFor(user: ItUser) {
  const token = signJwt({ sub: user.id, email: user.email, role: "authenticated", name: user.name });
  return new PostgrestClient<Database>(`${inject("restUrl")}/rest/v1`, { headers: { Authorization: `Bearer ${token}` } });
}

export function anonClient() {
  return new PostgrestClient<Database>(`${inject("restUrl")}/rest/v1`, {
    headers: { Authorization: `Bearer ${signJwt({ role: "anonymous" })}` },
  });
}

/** Acesso service_role (como o agendador em produção), direto no Postgres local. */
export async function serviceDb() {
  // Import tardio: admin.ts é "server-only" (o teste que usa já o simula).
  const { serviceDbFor } = await import("@/lib/db/admin");
  return serviceDbFor(`postgres://postgres@127.0.0.1:${inject("itPgPort")}/cashly_it`);
}
