import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createHousehold, createTestDatabase, createUser, type TestUser } from "./helpers";

let db: Client;
let drop: () => Promise<void>;
let user: TestUser;
let stranger: TestUser;
let household: string;
let account: string;

beforeAll(async () => {
  ({ db, drop } = await createTestDatabase());
  user = await createUser(db);
  stranger = await createUser(db);
  household = await createHousehold(db, user);
  await createHousehold(db, stranger);
  account = (await as(db, { user }, (q) => q("select id from accounts limit 1"))).rows[0].id;
});
afterAll(async () => drop());

const run = (sql: string, params: unknown[] = [], who: TestUser = user) => as(db, { user: who }, (q) => q(sql, params));
const balance = (until: string, who: TestUser = user) =>
  run("select public.registered_balance($1)::text as b", [until], who).then((r) => r.rows[0].b as string);
const insertTx = (type: string, amount: string, date: string, status = "confirmed", acc: string | null = account) =>
  run(
    "insert into transactions (household_id, type, status, amount, occurred_on, description, account_id) values ($1, $2, $3, $4, $5, 'x', $6) returning id",
    [household, type, status, amount, date, acc],
  ).then((r) => r.rows[0].id as string);

describe("saldo registrado", () => {
  it("conta nova: sem saldo inicial e sem data, considera todos os lançamentos realizados", async () => {
    const { rows } = await db.query("select opening_balance::text as b, opening_date from accounts where id = $1", [account]);
    expect(rows[0]).toEqual({ b: "0.00", opening_date: null });

    await insertTx("income", "3000.00", "2026-01-05");
    await insertTx("expense", "120.50", "2026-01-06");
    await insertTx("expense", "999.00", "2026-01-07", "planned");
    const canceled = await insertTx("expense", "500.00", "2026-01-08");
    await run("select public.cancel_transaction($1, 'Erro de digitação')", [canceled]);
    await insertTx("expense", "10.00", "2026-01-09", "confirmed", null);
    expect(await balance("2026-01-31")).toBe("2869.50");
    expect(await balance("2026-01-05")).toBe("3000.00");
    expect(await balance("2025-12-31")).toBe("0");
  });

  it("saldo inicial vale a partir da sua data; lançamentos anteriores da conta não entram", async () => {
    await run("update accounts set opening_balance = 1000, opening_date = '2026-02-01' where id = $1", [account]);
    // Antes da data do saldo inicial: nada da conta conta; o lançamento sem conta continua.
    expect(await balance("2026-01-31")).toBe("-10.00");
    await insertTx("expense", "200.00", "2026-02-10");
    expect(await balance("2026-02-28")).toBe("790.00");
  });

  it("saldo inicial diferente de zero exige data", async () => {
    await expect(run("update accounts set opening_balance = 50, opening_date = null where id = $1", [account])).rejects.toThrow(/check constraint/);
  });

  it("cada família vê só o próprio saldo", async () => {
    expect(await balance("2030-01-01", stranger)).toBe("0");
    await expect(as(db, "anon", (q) => q("select public.registered_balance('2030-01-01')"))).rejects.toThrow(/permission denied/);
  });
});

describe("orçamentos", () => {
  it("podem ser removidos pela família, não por outra", async () => {
    const { rows } = await run("insert into budgets (household_id, month, limit_amount) values ($1, '2026-10-01', 3000) returning id", [household]);
    const other = await run("delete from budgets where id = $1", [rows[0].id], stranger);
    expect(other.rowCount).toBe(0);
    const mine = await run("delete from budgets where id = $1", [rows[0].id]);
    expect(mine.rowCount).toBe(1);
  });

  it("lançamentos financeiros continuam sem exclusão", async () => {
    const id = await insertTx("expense", "1.00", "2026-03-01");
    await expect(run("delete from transactions where id = $1", [id])).rejects.toThrow(/permission denied/);
  });
});
