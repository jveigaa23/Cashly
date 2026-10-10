import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createHousehold, createTestDatabase, createUser, type TestUser } from "./helpers";

let db: Client;
let drop: () => Promise<void>;
let user: TestUser;
let household: string;
let expenseCategory: string;
let incomeCategory: string;

beforeAll(async () => {
  ({ db, drop } = await createTestDatabase());
  user = await createUser(db);
  household = await createHousehold(db, user);
  await as(db, { user }, async (q) => {
    expenseCategory = (await q("select id from categories where kind = 'expense' limit 1")).rows[0].id;
    incomeCategory = (await q("select id from categories where kind = 'income' limit 1")).rows[0].id;
  });
});
afterAll(async () => drop());

const run = (sql: string, params: unknown[] = []) => as(db, { user }, (q) => q(sql, params));

describe("integridade financeira no banco", () => {
  it("valores devem ser positivos", async () => {
    await expect(
      run(
        "insert into transactions (household_id, type, amount, occurred_on, description) values ($1, 'expense', -5, '2026-10-01', 'x')",
        [household],
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      run("insert into bills (household_id, name, original_amount, due_date) values ($1, 'Luz', 0, '2026-10-10')", [household]),
    ).rejects.toThrow(/check constraint/);
  });

  it("dinheiro é NUMERIC com 2 casas", async () => {
    const { rows } = await run(
      "insert into transactions (household_id, type, amount, occurred_on, description) values ($1, 'income', 0.1, '2026-10-01', 'x') returning amount, pg_typeof(amount)::text as t",
      [household],
    );
    expect(rows[0]).toEqual({ amount: "0.10", t: "numeric" });
  });

  it("cancelamento exige data de cancelamento", async () => {
    await expect(
      run(
        "insert into bills (household_id, name, original_amount, due_date, status) values ($1, 'Água', 50, '2026-10-10', 'canceled')",
        [household],
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("juros exigem periodicidade", async () => {
    await expect(
      run(
        "insert into bills (household_id, name, original_amount, due_date, interest_rate) values ($1, 'Cartão', 100, '2026-10-10', 1)",
        [household],
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("pagamento: principal + encargos = valor, e aponta para conta OU parcela", async () => {
    const bill = (
      await run("insert into bills (household_id, name, original_amount, due_date) values ($1, 'Luz', 100, '2026-10-10') returning id", [household])
    ).rows[0].id;
    await expect(
      run(
        "insert into bill_payments (household_id, bill_id, paid_on, amount, principal_amount, charges_amount) values ($1, $2, '2026-10-10', 100, 90, 5)",
        [household, bill],
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      run(
        "insert into bill_payments (household_id, paid_on, amount, principal_amount) values ($1, '2026-10-10', 100, 100)",
        [household],
      ),
    ).rejects.toThrow(/check constraint/);

    const payment = (
      await run(
        "insert into bill_payments (household_id, bill_id, paid_on, amount, principal_amount, charges_amount) values ($1, $2, '2026-10-12', 102.5, 100, 2.5) returning id",
        [household, bill],
      )
    ).rows[0].id;

    // Uma única despesa por pagamento (sem dupla contagem).
    const expense = "insert into transactions (household_id, type, amount, occurred_on, description, bill_payment_id) values ($1, 'expense', 102.5, '2026-10-12', 'Luz', $2)";
    await run(expense, [household, payment]);
    await expect(run(expense, [household, payment])).rejects.toThrow(/unique/);
  });

  it("recorrência não gera duplicata para a mesma data", async () => {
    const rule = (
      await run(
        "insert into recurrence_rules (household_id, target, frequency, day_of_month, starts_on) values ($1, 'bill', 'monthly', 31, '2026-01-31') returning id",
        [household],
      )
    ).rows[0].id;
    const insert = "insert into bills (household_id, name, original_amount, due_date, recurrence_rule_id, recurrence_date) values ($1, 'Aluguel', 1500, '2026-02-28', $2, '2026-02-28')";
    await run(insert, [household, rule]);
    await expect(run(insert, [household, rule])).rejects.toThrow(/unique/);
  });

  it("parcelas: número único por plano", async () => {
    const plan = (
      await run(
        "insert into installment_plans (household_id, kind, description, total_amount, installment_count, first_due_date) values ($1, 'purchase', 'Geladeira', 3000, 10, '2026-11-05') returning id",
        [household],
      )
    ).rows[0].id;
    const insert = "insert into installments (household_id, plan_id, number, due_date, expected_amount) values ($1, $2, 1, '2026-11-05', 300)";
    await run(insert, [household, plan]);
    await expect(run(insert, [household, plan])).rejects.toThrow(/unique/);
  });

  it("orçamento: mês começa no dia 1, só categoria de despesa, um por categoria/mês", async () => {
    await expect(
      run("insert into budgets (household_id, month, limit_amount) values ($1, '2026-10-15', 1000)", [household]),
    ).rejects.toThrow(/check constraint/);
    await expect(
      run("insert into budgets (household_id, month, category_id, limit_amount) values ($1, '2026-10-01', $2, 1000)", [household, incomeCategory]),
    ).rejects.toThrow(/foreign key/);

    const general = "insert into budgets (household_id, month, limit_amount) values ($1, '2026-10-01', 3000)";
    await run(general, [household]);
    await expect(run(general, [household])).rejects.toThrow(/unique/);

    const byCategory = "insert into budgets (household_id, month, category_id, limit_amount) values ($1, '2026-10-01', $2, 800)";
    await run(byCategory, [household, expenseCategory]);
    await expect(run(byCategory, [household, expenseCategory])).rejects.toThrow(/unique/);
  });

  it("categorias ativas não se repetem (sem diferenciar maiúsculas)", async () => {
    await expect(
      run("insert into categories (household_id, name, kind) values ($1, 'moradia', 'expense')", [household]),
    ).rejects.toThrow(/unique/);
  });
});

describe("notificações", () => {
  it("pessoa não cria registros de entrega (só o agendador)", async () => {
    const member = (await run("select id from household_members where user_id = $1", [user.id])).rows[0].id;
    await expect(
      run(
        `insert into notification_deliveries (household_id, member_id, channel, event, reference_type, reference_id, scheduled_for, status)
         values ($1, $2, 'push', 'due_soon', 'bill', gen_random_uuid(), '2026-10-10', 'sent')`,
        [household, member],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("pessoa só pode marcar o próprio aviso como lido", async () => {
    const member = (await run("select id from household_members where user_id = $1", [user.id])).rows[0].id;
    const delivery = (
      await as(db, "service_role", (q) =>
        q(
          `insert into notification_deliveries (household_id, member_id, channel, event, reference_type, reference_id, scheduled_for)
           values ($1, $2, 'in_app', 'due_soon', 'bill', gen_random_uuid(), '2026-10-10') returning id`,
          [household, member],
        ),
      )
    ).rows[0].id;
    await expect(
      run("update notification_deliveries set status = 'sent' where id = $1", [delivery]),
    ).rejects.toThrow(/row-level security/);
    const ok = await run("update notification_deliveries set status = 'read', read_at = now() where id = $1", [delivery]);
    expect(ok.rowCount).toBe(1);

    const stranger = await createUser(db);
    await createHousehold(db, stranger);
    const seen = await as(db, { user: stranger }, (q) => q("select * from notification_deliveries"));
    expect(seen.rows).toEqual([]);
  });
});
