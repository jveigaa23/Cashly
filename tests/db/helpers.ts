import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { inject } from "vitest";

export interface TestUser {
  id: string;
  email: string;
}

/** Cria um banco próprio para o arquivo de teste a partir do modelo migrado. */
export async function createTestDatabase(): Promise<{ db: Client; drop: () => Promise<void> }> {
  const port = inject("pgPort");
  const name = `t_${randomUUID().replace(/-/g, "")}`;
  const admin = new Client({ host: "127.0.0.1", port, user: "postgres", database: "postgres" });
  await admin.connect();
  await admin.query(`create database ${name} template cashly_template`);
  const db = new Client({ host: "127.0.0.1", port, user: "postgres", database: name });
  await db.connect();
  return {
    db,
    drop: async () => {
      await db.end();
      await admin.query(`drop database ${name}`);
      await admin.end();
    },
  };
}

export async function createUser(db: Client, email = `${randomUUID()}@exemplo.test`): Promise<TestUser> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [email],
  );
  return { id: rows[0].id, email };
}

type Role = { user: TestUser } | "anon" | "service_role";

/**
 * Executa `fn` como faria a API do Supabase: papel `authenticated` com as
 * claims do JWT do usuário, `anon` sem login, ou `service_role`.
 * Tudo dentro de uma transação desfeita ao final (ou mantida com commit: true).
 */
export async function as<T>(
  db: Client,
  role: Role,
  fn: (q: Client["query"]) => Promise<T>,
  { commit = true }: { commit?: boolean } = {},
): Promise<T> {
  await db.query("begin");
  try {
    if (role === "anon") {
      await db.query("set local role anon");
      await db.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    } else if (role === "service_role") {
      await db.query("set local role service_role");
      await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    } else {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: role.user.id, email: role.user.email, role: "authenticated" }),
      ]);
    }
    const result = await fn(db.query.bind(db) as Client["query"]);
    await db.query(commit ? "commit" : "rollback");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

/** Cria uma família completa (dono) pelo caminho real (RPC). */
export async function createHousehold(db: Client, owner: TestUser, name = "Família Teste") {
  return as(db, { user: owner }, async (q) => {
    const { rows } = await q<{ id: string }>("select public.create_household($1, $2) as id", [name, "Dono"]);
    return rows[0].id;
  });
}
