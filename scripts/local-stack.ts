/**
 * Pilha Supabase local e isolada: PostgreSQL temporário + GoTrue (Auth) +
 * PostgREST + gateway em http://127.0.0.1:54321 (/auth/v1 e /rest/v1).
 * Usada pelos testes E2E e para desenvolver sem acesso ao projeto real.
 *
 *   node scripts/local-stack.ts            # só a pilha
 *   node scripts/local-stack.ts --app      # pilha + `next start` (build feito com LOCAL_APP_ENV)
 *
 * Os dados somem ao encerrar. E-mails são confirmados automaticamente.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import { Client } from "pg";
import { startPostgres } from "../tests/support/postgres.ts";
import {
  LOCAL_APP_ENV,
  LOCAL_APP_PORT,
  LOCAL_GATEWAY_PORT,
  LOCAL_JWT_SECRET,
  LOCAL_SITE_URL,
  LOCAL_SUPABASE_URL,
} from "./local-stack-config.ts";

const POSTGREST_VERSION = "v14.1";
const GOTRUE_VERSION = "v2.180.0";
const CACHE = join(process.cwd(), "node_modules", ".cache");
const DB = "cashly";

function download(url: string, dir: string, check: string): string {
  const target = join(dir, check);
  if (existsSync(target)) return target;
  mkdirSync(dir, { recursive: true });
  const tar = url.endsWith(".xz") ? "-xJ" : "-xz";
  try {
    execFileSync("sh", ["-c", `curl -fsSL "${url}" | tar ${tar} -C "${dir}"`], { stdio: "pipe" });
  } catch (error) {
    throw new Error(`Falha ao baixar ${url}: ${(error as Error).message}`);
  }
  return target;
}

async function waitFor(url: string, name: string, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // subindo
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${name} não respondeu em ${url}`);
}

const children: ChildProcess[] = [];
let stopPg: (() => void) | undefined;
let gateway: http.Server | undefined;

function shutdown(code = 0) {
  gateway?.close();
  for (const c of children) c.kill("SIGTERM");
  try {
    stopPg?.();
  } catch {
    // ignorar
  }
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  const withApp = process.argv.includes("--app");
  const postgrest = download(
    `https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-linux-static-x86-64.tar.xz`,
    join(CACHE, "postgrest", POSTGREST_VERSION),
    "postgrest",
  );
  const gotrue = download(
    `https://github.com/supabase/auth/releases/download/${GOTRUE_VERSION}/auth-${GOTRUE_VERSION}-x86.tar.gz`,
    join(CACHE, "gotrue", GOTRUE_VERSION),
    "auth",
  );
  const gotrueDir = join(CACHE, "gotrue", GOTRUE_VERSION);

  const pg = await startPostgres();
  stopPg = pg.stop;
  const url = (user: string) => `postgres://${user}@127.0.0.1:${pg.port}/${DB}`;

  const admin = new Client({ host: "127.0.0.1", port: pg.port, user: "postgres", database: "postgres" });
  await admin.connect();
  await admin.query(`create database ${DB}`);
  await admin.end();

  const db = new Client({ host: "127.0.0.1", port: pg.port, user: "postgres", database: DB });
  await db.connect();
  // Papéis e privilégios como no Supabase.
  await db.query(`
    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    create role service_role nologin noinherit bypassrls;
    create role authenticator noinherit login;
    grant anon, authenticated, service_role to authenticator;
    create role supabase_auth_admin noinherit createrole login;
    create schema auth authorization supabase_auth_admin;
    grant usage on schema auth to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);

  const gotrueEnv = {
    PATH: process.env.PATH ?? "",
    GOTRUE_DB_DRIVER: "postgres",
    DATABASE_URL: `${url("supabase_auth_admin")}?search_path=auth`,
    DB_NAMESPACE: "auth",
    GOTRUE_API_HOST: "127.0.0.1",
    PORT: String(pg.port + 2),
    API_EXTERNAL_URL: `${LOCAL_SUPABASE_URL}/auth/v1`,
    GOTRUE_SITE_URL: LOCAL_SITE_URL,
    GOTRUE_URI_ALLOW_LIST: `${LOCAL_SITE_URL}/**`,
    GOTRUE_JWT_SECRET: LOCAL_JWT_SECRET,
    GOTRUE_JWT_EXP: "3600",
    GOTRUE_JWT_AUD: "authenticated",
    GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
    GOTRUE_JWT_ADMIN_ROLES: "service_role",
    GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
    GOTRUE_MAILER_AUTOCONFIRM: "true",
    GOTRUE_PASSWORD_MIN_LENGTH: "8",
    GOTRUE_RATE_LIMIT_TOKEN_REFRESH: "10000",
    GOTRUE_RATE_LIMIT_VERIFY: "10000",
    GOTRUE_RATE_LIMIT_EMAIL_SENT: "10000",
    GOTRUE_RATE_LIMIT_OTP: "10000",
    GOTRUE_LOG_LEVEL: "error",
  } as unknown as NodeJS.ProcessEnv;
  execFileSync(gotrue, ["migrate"], { cwd: gotrueDir, env: gotrueEnv, stdio: "pipe" });
  await db.query("grant execute on all functions in schema auth to anon, authenticated, service_role;");

  const migrations = readdirSync(join(process.cwd(), "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const file of migrations) {
    await db.query(readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8"));
  }
  await db.end();

  const auth = spawn(gotrue, ["serve"], { cwd: gotrueDir, env: gotrueEnv, stdio: "ignore" });
  children.push(auth);
  const restPort = pg.port + 1;
  const rest = spawn(postgrest, [], {
    env: {
      PGRST_DB_URI: url("authenticator"),
      PGRST_DB_SCHEMAS: "public",
      PGRST_DB_ANON_ROLE: "anon",
      PGRST_JWT_SECRET: LOCAL_JWT_SECRET,
      PGRST_SERVER_HOST: "127.0.0.1",
      PGRST_SERVER_PORT: String(restPort),
      PGRST_LOG_LEVEL: "crit",
    } as unknown as NodeJS.ProcessEnv,
    stdio: ["ignore", "ignore", "inherit"],
  });
  children.push(rest);

  const routes: [string, number][] = [
    ["/auth/v1", pg.port + 2],
    ["/rest/v1", restPort],
  ];
  gateway = http.createServer((req, res) => {
    const route = routes.find(([prefix]) => req.url?.startsWith(prefix));
    if (!route) {
      res.writeHead(404).end();
      return;
    }
    const upstream = http.request(
      { host: "127.0.0.1", port: route[1], path: req.url!.slice(route[0].length) || "/", method: req.method, headers: req.headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => res.writeHead(502).end());
    req.pipe(upstream);
  });
  await new Promise<void>((resolve, reject) => {
    gateway!.once("error", reject);
    gateway!.listen(LOCAL_GATEWAY_PORT, "127.0.0.1", resolve);
  });
  await waitFor(`${LOCAL_SUPABASE_URL}/auth/v1/health`, "GoTrue");
  await waitFor(`${LOCAL_SUPABASE_URL}/rest/v1/`, "PostgREST");
  console.log(`[pilha local] Supabase em ${LOCAL_SUPABASE_URL} (PostgreSQL na porta ${pg.port})`);

  if (withApp) {
    const app = spawn("pnpm", ["exec", "next", "start", "--port", String(LOCAL_APP_PORT)], {
      env: { ...process.env, ...LOCAL_APP_ENV },
      stdio: "inherit",
    });
    children.push(app);
    app.on("exit", (code) => shutdown(code ?? 0));
  }
}

main().catch((error) => {
  console.error("[pilha local] erro:", error);
  shutdown(1);
});
