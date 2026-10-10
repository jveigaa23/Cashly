/**
 * Ambiente de integração local e isolado: PostgreSQL temporário +
 * PostgREST real (mesmo motor da API do Supabase) + proxy em /rest/v1.
 * Os testes usam supabase-js com JWTs assinados localmente.
 * Nunca acessa o projeto Supabase real.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import { Client } from "pg";
import type { TestProject } from "vitest/node";
import { createMigratedDatabase, startPostgres } from "../support/postgres";

const POSTGREST_VERSION = "v14.1";
const DB_NAME = "cashly_it";

function ensurePostgrest(): string {
  const dir = join(process.cwd(), "node_modules", ".cache", "postgrest", POSTGREST_VERSION);
  const bin = join(dir, "postgrest");
  if (existsSync(bin)) return bin;
  mkdirSync(dir, { recursive: true });
  const url = `https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-linux-static-x86-64.tar.xz`;
  try {
    execFileSync("sh", ["-c", `curl -fsSL "${url}" | tar -xJ -C "${dir}"`], { stdio: "pipe" });
  } catch (error) {
    throw new Error(
      `Não foi possível baixar o PostgREST (${url}). Baixe manualmente e coloque o binário em ${bin}. ${(error as Error).message}`,
    );
  }
  return bin;
}

async function waitFor(url: string, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`PostgREST não respondeu em ${url}`);
}

export default async function setup(project: TestProject) {
  const postgrestBin = ensurePostgrest();
  const pg = await startPostgres();
  let postgrest: ChildProcess | undefined;
  let proxy: http.Server | undefined;

  const cleanup = () => {
    proxy?.close();
    postgrest?.kill("SIGTERM");
    pg.stop();
  };

  try {
    await createMigratedDatabase(pg.port, DB_NAME);
    const admin = new Client({ host: "127.0.0.1", port: pg.port, user: "postgres", database: DB_NAME });
    await admin.connect();
    await admin.query("create role authenticator noinherit login; grant anon, authenticated, service_role to authenticator;");
    await admin.end();

    const jwtSecret = randomBytes(32).toString("hex");
    const restPort = pg.port + 1;
    postgrest = spawn(postgrestBin, [], {
      env: {
        PGRST_DB_URI: `postgres://authenticator@127.0.0.1:${pg.port}/${DB_NAME}`,
        PGRST_DB_SCHEMAS: "public",
        PGRST_DB_ANON_ROLE: "anon",
        PGRST_JWT_SECRET: jwtSecret,
        PGRST_SERVER_HOST: "127.0.0.1",
        PGRST_SERVER_PORT: String(restPort),
        PGRST_LOG_LEVEL: "crit",
      } as unknown as NodeJS.ProcessEnv,
      stdio: ["ignore", "ignore", "inherit"],
    });
    await waitFor(`http://127.0.0.1:${restPort}/`);

    // Proxy: o supabase-js chama <url>/rest/v1/...; o PostgREST serve na raiz.
    proxy = http.createServer((req, res) => {
      const path = (req.url ?? "/").replace(/^\/rest\/v1/, "") || "/";
      const upstream = http.request(
        { host: "127.0.0.1", port: restPort, path, method: req.method, headers: req.headers },
        (up) => {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.pipe(res);
        },
      );
      upstream.on("error", () => {
        res.writeHead(502);
        res.end();
      });
      req.pipe(upstream);
    });
    await new Promise<void>((resolve) => proxy!.listen(0, "127.0.0.1", resolve));
    const address = proxy.address();
    if (!address || typeof address === "string") throw new Error("Proxy sem porta");

    project.provide("restUrl", `http://127.0.0.1:${address.port}`);
    project.provide("jwtSecret", jwtSecret);
    project.provide("itPgPort", pg.port);
  } catch (error) {
    cleanup();
    throw error;
  }

  return cleanup;
}

declare module "vitest" {
  export interface ProvidedContext {
    restUrl: string;
    jwtSecret: string;
    itPgPort: number;
  }
}
