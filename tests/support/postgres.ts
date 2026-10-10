/**
 * PostgreSQL temporário e isolado para testes (nunca o projeto real).
 * Requer initdb/pg_ctl (PostgreSQL 15+). Sem eles, falha com instrução.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";

const PG_BIN_CANDIDATES = [
  process.env.PG_BIN,
  "/usr/lib/postgresql/17/bin",
  "/usr/lib/postgresql/16/bin",
  "/usr/lib/postgresql/15/bin",
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
].filter(Boolean) as string[];

function findPgBin(): string {
  const dir = PG_BIN_CANDIDATES.find((d) => existsSync(join(d, "initdb")) && existsSync(join(d, "pg_ctl")));
  if (!dir) {
    throw new Error(
      "PostgreSQL (initdb/pg_ctl) não encontrado. Instale o PostgreSQL 15+ ou defina PG_BIN com o diretório dos binários.",
    );
  }
  return dir;
}

const isRoot = process.getuid?.() === 0;

function run(bin: string, args: string[]) {
  // O PostgreSQL recusa rodar como root: usa o usuário "postgres" nesse caso.
  if (isRoot) execFileSync("runuser", ["-u", "postgres", "--", bin, ...args], { stdio: "pipe" });
  else execFileSync(bin, args, { stdio: "pipe" });
}

export interface TempPostgres {
  port: number;
  stop: () => void;
}

export async function startPostgres(): Promise<TempPostgres> {
  const bin = findPgBin();
  const dataDir = mkdtempSync(join(tmpdir(), "cashly-pg-"));
  if (isRoot) {
    execFileSync("chown", ["postgres:postgres", dataDir]);
    chmodSync(dataDir, 0o700);
  }
  const port = 50000 + Math.floor(Math.random() * 10000);
  run(join(bin, "initdb"), ["-D", dataDir, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C.UTF-8"]);
  run(join(bin, "pg_ctl"), [
    "-D", dataDir, "-w", "-l", join(dataDir, "server.log"),
    "-o", `-p ${port} -c listen_addresses=127.0.0.1 -k ${dataDir} -c fsync=off`,
    "start",
  ]);
  return {
    port,
    stop: () => {
      try {
        run(join(bin, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "stop"]);
      } finally {
        rmSync(dataDir, { recursive: true, force: true });
      }
    },
  };
}

/** Cria um banco com a réplica do Supabase + todas as migrações. */
export async function createMigratedDatabase(port: number, name: string): Promise<void> {
  const admin = new Client({ host: "127.0.0.1", port, user: "postgres", database: "postgres" });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const db = new Client({ host: "127.0.0.1", port, user: "postgres", database: name });
  await db.connect();
  const root = join(process.cwd(), "supabase");
  await db.query(readFileSync(join(root, "tests", "supabase-shim.sql"), "utf8"));
  const migrations = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const file of migrations) {
    try {
      await db.query(readFileSync(join(root, "migrations", file), "utf8"));
    } catch (error) {
      throw new Error(`Falha ao aplicar a migração ${file}: ${(error as Error).message}`);
    }
  }
  await db.end();
}
