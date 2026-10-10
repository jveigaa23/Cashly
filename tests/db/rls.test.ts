import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createHousehold, createTestDatabase, createUser, type TestUser } from "./helpers";

let db: Client;
let drop: () => Promise<void>;

// Família A (pais) e família B (estranhos).
let alice: TestUser;
let bob: TestUser;
let familyA: string;
let familyB: string;
let categoryA: string;
let accountA: string;
let transactionA: string;

const HOUSEHOLD_TABLES = [
  "accounts", "categories", "recurrence_rules", "bills", "installment_plans",
  "installments", "bill_payments", "transactions", "budgets",
  "notification_preferences", "notification_deliveries", "push_subscriptions", "audit_log",
];

beforeAll(async () => {
  ({ db, drop } = await createTestDatabase());
  alice = await createUser(db, "alice@exemplo.test");
  bob = await createUser(db, "bob@exemplo.test");
  familyA = await createHousehold(db, alice, "Família A");
  familyB = await createHousehold(db, bob, "Família B");

  await as(db, { user: alice }, async (q) => {
    categoryA = (await q("select id from categories where kind = 'expense' limit 1")).rows[0].id;
    accountA = (await q("select id from accounts limit 1")).rows[0].id;
    transactionA = (
      await q(
        `insert into transactions (household_id, type, amount, occurred_on, description, category_id, account_id)
         values ($1, 'expense', 120.50, '2026-10-05', 'Mercado', $2, $3) returning id`,
        [familyA, categoryA, accountA],
      )
    ).rows[0].id;
  });
});
afterAll(async () => drop());

describe("configuração", () => {
  it("todas as tabelas do schema public têm RLS habilitada", async () => {
    const { rows } = await db.query(
      "select tablename from pg_tables where schemaname = 'public' and not rowsecurity",
    );
    expect(rows).toEqual([]);
  });

  it("anon não tem nenhum privilégio em tabelas", async () => {
    const { rows } = await db.query(
      `select table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'anon' and table_schema = 'public'`,
    );
    expect(rows).toEqual([]);
  });

  it("ninguém além do dono do banco pode apagar registros financeiros", async () => {
    const { rows } = await db.query(
      `select table_name from information_schema.role_table_grants
       where grantee = 'authenticated' and table_schema = 'public' and privilege_type = 'DELETE'`,
    );
    expect(rows.map((r) => r.table_name)).toEqual(["push_subscriptions"]);
  });

  it("funções SECURITY DEFINER têm search_path fixo", async () => {
    const { rows } = await db.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and p.prosecdef
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
    );
    expect(rows).toEqual([]);
  });
});

describe("visitante sem login (anon)", () => {
  it.each(["households", "transactions", "bills", "household_members"])("não lê %s", async (table) => {
    await expect(as(db, "anon", (q) => q(`select * from ${table}`))).rejects.toThrow(/permission denied/);
  });

  it("não executa funções da aplicação", async () => {
    await expect(
      as(db, "anon", (q) => q("select public.create_household('X', 'Y')")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("isolamento entre famílias", () => {
  it("família B não vê nenhuma linha da família A em nenhuma tabela", async () => {
    for (const table of ["households", "household_members", ...HOUSEHOLD_TABLES]) {
      const column = table === "households" ? "id" : "household_id";
      const { rows } = await as(db, { user: bob }, (q) =>
        q(`select count(*)::int as n from ${table} where ${column} = $1`, [familyA]),
      );
      expect(rows[0].n, table).toBe(0);
    }
  });

  it("cada família vê apenas os próprios dados", async () => {
    const seen = await as(db, { user: alice }, (q) => q("select distinct household_id from categories"));
    expect(seen.rows).toEqual([{ household_id: familyA }]);
  });

  it("B não consegue inserir na família A, mesmo informando household_id", async () => {
    await expect(
      as(db, { user: bob }, (q) =>
        q(
          `insert into transactions (household_id, type, amount, occurred_on, description)
           values ($1, 'expense', 1, '2026-10-01', 'invasão')`,
          [familyA],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("B não consegue alterar dados da família A", async () => {
    const result = await as(db, { user: bob }, (q) =>
      q("update transactions set amount = 1 where id = $1", [transactionA]),
    );
    expect(result.rowCount).toBe(0);
    const { rows } = await db.query("select amount from transactions where id = $1", [transactionA]);
    expect(rows[0].amount).toBe("120.50");
  });

  it("B não consegue usar categoria ou conta da família A nos próprios lançamentos", async () => {
    await expect(
      as(db, { user: bob }, (q) =>
        q(
          `insert into transactions (household_id, type, amount, occurred_on, description, category_id)
           values ($1, 'expense', 1, '2026-10-01', 'x', $2)`,
          [familyB, categoryA],
        ),
      ),
    ).rejects.toThrow(/foreign key/);
    await expect(
      as(db, { user: bob }, (q) =>
        q(
          `insert into transactions (household_id, type, amount, occurred_on, description, account_id)
           values ($1, 'expense', 1, '2026-10-01', 'x', $2)`,
          [familyB, accountA],
        ),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("não é possível mover um registro para outra família", async () => {
    await expect(
      as(db, { user: alice }, (q) =>
        q("update transactions set household_id = $1 where id = $2", [familyB, transactionA]),
      ),
    ).rejects.toThrow();
  });

  it("B não consegue se adicionar à família A", async () => {
    await expect(
      as(db, { user: bob }, (q) =>
        q(
          "insert into household_members (household_id, user_id, role, display_name) values ($1, $2, 'owner', 'x')",
          [familyA, bob.id],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("autorização dentro da família", () => {
  it("membro não altera o próprio papel", async () => {
    await expect(
      as(db, { user: alice }, (q) => q("update household_members set role = 'member' where user_id = $1", [alice.id])),
    ).rejects.toThrow(/permission denied/);
  });

  it("membro altera o próprio nome de exibição", async () => {
    const result = await as(db, { user: alice }, (q) =>
      q("update household_members set display_name = 'Mãe' where user_id = $1", [alice.id]),
    );
    expect(result.rowCount).toBe(1);
  });

  it("ninguém apaga lançamentos pela API", async () => {
    await expect(
      as(db, { user: alice }, (q) => q("delete from transactions where id = $1", [transactionA])),
    ).rejects.toThrow(/permission denied/);
  });

  it("autor do registro é definido pelo servidor, não pelo cliente", async () => {
    await expect(
      as(db, { user: alice }, (q) =>
        q(
          `insert into transactions (household_id, type, amount, occurred_on, description, created_by)
           values ($1, 'income', 10, '2026-10-01', 'teste', $2)`,
          [familyA, bob.id],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    const { rows } = await as(db, { user: alice }, (q) =>
      q(
        `insert into transactions (household_id, type, amount, occurred_on, description)
         values ($1, 'income', 10, '2026-10-01', 'teste') returning created_by`,
        [familyA],
      ),
    );
    expect(rows[0].created_by).toBe(alice.id);
  });

  it("is_demo não pode ser ligado pelo cliente", async () => {
    await expect(
      as(db, { user: alice }, (q) => q("update households set is_demo = true where id = $1", [familyA])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("histórico de alterações", () => {
  it("registra inserções e alterações com autor e diferenças", async () => {
    await as(db, { user: alice }, (q) =>
      q("update transactions set description = 'Supermercado' where id = $1", [transactionA]),
    );
    const { rows } = await as(db, { user: alice }, (q) =>
      q("select action, actor_id, changes from audit_log where entity_id = $1 order by id", [transactionA]),
    );
    expect(rows.map((r) => r.action)).toEqual(["insert", "update"]);
    expect(rows[1].actor_id).toBe(alice.id);
    expect(rows[1].changes).toEqual({ description: { old: "Mercado", new: "Supermercado" } });
  });

  it("histórico não pode ser forjado, alterado nem apagado", async () => {
    for (const sql of [
      "insert into audit_log (household_id, entity, entity_id, action, changes) values ($1, 'x', gen_random_uuid(), 'insert', '{}')",
      "update audit_log set changes = '{}' where household_id = $1",
      "delete from audit_log where household_id = $1",
    ]) {
      await expect(as(db, { user: alice }, (q) => q(sql, [familyA]))).rejects.toThrow(/permission denied/);
    }
  });

  it("B não vê o histórico de A", async () => {
    const { rows } = await as(db, { user: bob }, (q) => q("select * from audit_log where entity_id = $1", [transactionA]));
    expect(rows).toEqual([]);
  });
});
