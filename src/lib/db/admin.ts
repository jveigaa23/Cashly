import "server-only";
import { Pool, types, type PoolClient } from "pg";

/**
 * Conexão direta com o Postgres no papel service_role (ignora o RLS).
 * USO EXCLUSIVO do agendador de notificações (rota protegida por CRON_SECRET).
 * Nunca importar em componentes, Server Actions de usuário ou código do cliente.
 *
 * DATABASE_URL é do dono do banco; cada operação roda numa transação com
 * SET LOCAL ROLE service_role, então vale só o que service_role pode fazer.
 */

export interface ServiceDb {
  /** Roda `fn` numa transação como service_role (commit no fim, rollback no erro). */
  transaction<T>(fn: (q: ServiceQuery) => Promise<T>): Promise<T>;
}

export type ServiceQuery = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>;

// Datas e instantes como texto, igual ao Data API: "AAAA-MM-DD" nunca vira Date
// (que mostraria o dia anterior no Brasil). NUMERIC já chega como texto.
const AS_TEXT = new Set([1082, 1114, 1184]);
const typeParsers = {
  getTypeParser: ((oid: number, format?: "text" | "binary") =>
    AS_TEXT.has(oid) ? (value: string) => value : types.getTypeParser(oid, format)) as typeof types.getTypeParser,
};

const pools = new Map<string, Pool>();

function serviceDbFromClient(connect: () => Promise<PoolClient>): ServiceDb {
  return {
    async transaction(fn) {
      const client = await connect();
      try {
        await client.query("begin");
        await client.query("set local role service_role");
        const result = await fn(async (text, params) => (await client.query(text, params)).rows);
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

/** Acesso service_role a um banco (uma pool por endereço, reaproveitada). */
export function serviceDbFor(connectionString: string): ServiceDb {
  let pool = pools.get(connectionString);
  if (!pool) {
    pool = new Pool({ connectionString, max: 2, types: typeParsers });
    pools.set(connectionString, pool);
  }
  const p = pool;
  return serviceDbFromClient(() => p.connect());
}

export function createAdminClient(): ServiceDb | null {
  const connectionString = process.env.DATABASE_URL;
  return connectionString ? serviceDbFor(connectionString) : null;
}

export type AdminClient = ServiceDb;
