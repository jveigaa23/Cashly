import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSchedule } from "@/domain/installments";
import { parseRate } from "@/domain/rates";
import { occurrences } from "@/domain/recurrence";
import { addDays, addMonthsClamped } from "@/lib/format/date";
import { as, createHousehold, createTestDatabase, createUser, type TestUser } from "./helpers";

let db: Client;
let drop: () => Promise<void>;
let connect: () => Promise<Client>;
let user: TestUser;
let stranger: TestUser;
let household: string;
let expenseCategory: string;
let incomeCategory: string;
let today: string;

beforeAll(async () => {
  ({ db, drop, connect } = await createTestDatabase());
  user = await createUser(db);
  stranger = await createUser(db);
  household = await createHousehold(db, user);
  await createHousehold(db, stranger);
  await as(db, { user }, async (q) => {
    expenseCategory = (await q("select id from categories where kind = 'expense' limit 1")).rows[0].id;
    incomeCategory = (await q("select id from categories where kind = 'income' limit 1")).rows[0].id;
  });
  today = (await db.query("select private.household_today($1)::text as d", [household])).rows[0].d;
});
afterAll(async () => drop());

const run = (sql: string, params: unknown[] = [], who: TestUser = user) => as(db, { user: who }, (q) => q(sql, params));

describe("mesmas regras no TypeScript e no banco", () => {
  it("add_months_clamped", async () => {
    const cases: [string, number, number][] = [
      ["2026-01-31", 1, 31], ["2026-01-31", 2, 31], ["2024-01-31", 1, 31], ["2023-12-15", 2, 15],
      ["2026-03-31", -1, 31], ["2026-05-01", 9, 30], ["2025-02-28", 12, 29],
    ];
    for (const [date, months, anchor] of cases) {
      const { rows } = await db.query("select private.add_months_clamped($1, $2, $3)::text as d", [date, months, anchor]);
      expect(rows[0].d, `${date} + ${months}`).toBe(addMonthsClamped(date, months, anchor));
    }
  });

  it("datas de recorrência", async () => {
    const rules = [
      { frequency: "monthly" as const, intervalCount: 1, dayOfMonth: 31, startsOn: "2024-01-01", endsOn: null },
      { frequency: "monthly" as const, intervalCount: 2, dayOfMonth: 5, startsOn: "2026-01-05", endsOn: "2026-09-05" },
      { frequency: "monthly" as const, intervalCount: 1, dayOfMonth: 10, startsOn: "2026-10-15", endsOn: null },
      { frequency: "yearly" as const, intervalCount: 1, dayOfMonth: null, startsOn: "2024-02-29", endsOn: null },
      { frequency: "monthly" as const, intervalCount: 3, dayOfMonth: 30, startsOn: "2025-11-30", endsOn: null },
    ];
    for (const r of rules) {
      const { rows } = await db.query(
        "select d::text from private.recurrence_dates($1, $2, $3, $4, $5, $6, $7) d",
        [r.frequency, r.intervalCount, r.dayOfMonth, r.startsOn, r.endsOn, "2024-01-01", "2028-12-31"],
      );
      expect(rows.map((x) => x.d), JSON.stringify(r)).toEqual(occurrences(r, "2024-01-01", "2028-12-31"));
    }
  });

  it("cronograma de parcelas (resíduo, juros simples, fim de mês)", async () => {
    const cases = [
      { totalCents: 10000, count: 3, firstDueDate: "2026-11-05", method: "none" as const, rate: "0" },
      { totalCents: 100001, count: 3, firstDueDate: "2026-01-31", method: "simple_monthly" as const, rate: "1,5" },
      { totalCents: 123457, count: 7, firstDueDate: "2024-01-31", method: "simple_monthly" as const, rate: "2,99" },
      { totalCents: 99999, count: 12, firstDueDate: "2026-12-31", method: "none" as const, rate: "0" },
      { totalCents: 5000000, count: 48, firstDueDate: "2026-03-30", method: "simple_monthly" as const, rate: "0,85" },
    ];
    for (const c of cases) {
      const rateMicro = parseRate(c.rate)!;
      const expected = buildSchedule({ ...c, rateMicro });
      const { rows } = await db.query(
        "select number, due_date::text as d, (amount * 100)::bigint::int as cents from private.installment_schedule($1, $2, $3, $4, $5)",
        [(c.totalCents / 100).toFixed(2), c.count, c.firstDueDate, c.method, c.rate.replace(",", ".")],
      );
      expect(rows.map((r) => ({ number: r.number, dueDate: r.d, amountCents: r.cents })), JSON.stringify(c)).toEqual(expected);
    }
  });
});

describe("parcelamentos", () => {
  async function createPlan(total = "1000.00", count = 4, method = "none", rate = "0", requestId: string | null = null) {
    const { rows } = await run(
      "select public.create_installment_plan('purchase', 'Geladeira', $1, $2, $3, '2026-01-31', $4, $5, $6) as id",
      [expenseCategory, total, count, method, rate, requestId],
    );
    return rows[0].id as string;
  }
  const installmentsOf = (plan: string) =>
    db.query("select id, number, due_date::text as d, expected_amount::text as a, status from installments where plan_id = $1 order by number", [plan]).then((r) => r.rows);

  it("gera parcelas com resíduo na última e datas de fim de mês", async () => {
    const plan = await createPlan("1000.00", 3);
    expect(await installmentsOf(plan)).toEqual([
      expect.objectContaining({ number: 1, d: "2026-01-31", a: "333.33", status: "pending" }),
      expect.objectContaining({ number: 2, d: "2026-02-28", a: "333.33" }),
      expect.objectContaining({ number: 3, d: "2026-03-31", a: "333.34" }),
    ]);
  });

  it("idempotente com o mesmo formulário", async () => {
    const requestId = randomUUID();
    const a = await createPlan("100.00", 2, "none", "0", requestId);
    const b = await createPlan("100.00", 2, "none", "0", requestId);
    expect(b).toBe(a);
    expect(await installmentsOf(a)).toHaveLength(2);
  });

  it("valida entradas", async () => {
    await expect(createPlan("0", 2)).rejects.toThrow("invalid_amount");
    await expect(createPlan("100.00", 0)).rejects.toThrow("invalid_count");
    await expect(createPlan("100.00", 2, "price")).rejects.toThrow("invalid_method");
    await expect(createPlan("100.00", 2, "none", "1")).rejects.toThrow("invalid_rate");
    await expect(createPlan("0.01", 2)).rejects.toThrow("invalid_amount");
    await expect(
      run("select public.create_installment_plan('purchase', 'x', $1, 100, 2, '2026-01-31', 'none', 0, null)", [incomeCategory]),
    ).rejects.toThrow("category_kind_mismatch");
  });

  it("pagar parcelas atualiza status; plano termina quando todas pagas; cancelar reabre", async () => {
    const plan = await createPlan("200.00", 2);
    const [p1, p2] = await installmentsOf(plan);
    const pay = (id: string, amount: string, charges = "0") =>
      run("select public.register_installment_payment($1, $2, $3, $4, null, 'Pix', null, null) as id", [id, today, amount, charges]).then((r) => r.rows[0].id as string);

    await pay(p1.id, "40.00");
    expect((await installmentsOf(plan))[0].status).toBe("partially_paid");
    await expect(pay(p1.id, "60.01")).rejects.toThrow("payment_exceeds_outstanding");
    await pay(p1.id, "62.00", "2.00");
    const last = await pay(p2.id, "100.00");
    expect((await installmentsOf(plan)).map((i) => i.status)).toEqual(["paid", "paid"]);
    expect((await db.query("select status from installment_plans where id = $1", [plan])).rows[0].status).toBe("finished");
    await expect(pay(p2.id, "1.00")).rejects.toThrow("installment_already_paid");

    const tx = await db.query("select description, amount::text, category_id from transactions where bill_payment_id = $1", [last]);
    expect(tx.rows[0]).toEqual({ description: "Parcela 2/2: Geladeira", amount: "100.00", category_id: expenseCategory });

    await run("select public.cancel_bill_payment($1, 'Engano')", [last]);
    expect((await installmentsOf(plan))[1].status).toBe("pending");
    expect((await db.query("select status from installment_plans where id = $1", [plan])).rows[0].status).toBe("active");
  });

  it("plano com pagamento não é cancelado; sem pagamento, cancela todas as parcelas", async () => {
    const plan = await createPlan("100.00", 2);
    const [p1] = await installmentsOf(plan);
    const payment = (await run("select public.register_installment_payment($1, $2, 10, 0, null, null, null, null) as id", [p1.id, today])).rows[0].id;
    await expect(run("select public.cancel_installment_plan($1, 'Desisti')", [plan])).rejects.toThrow("plan_has_payments");
    await run("select public.cancel_bill_payment($1, 'Engano')", [payment]);
    await run("select public.cancel_installment_plan($1, 'Desisti')", [plan]);
    expect((await installmentsOf(plan)).every((i) => i.status === "canceled")).toBe(true);
    await expect(run("select public.register_installment_payment($1, $2, 10, 0, null, null, null, null)", [p1.id, today])).rejects.toThrow("plan_canceled");
  });

  it("isolamento e escrita direta bloqueada", async () => {
    const plan = await createPlan("100.00", 2);
    const [p1] = await installmentsOf(plan);
    await expect(run("select public.register_installment_payment($1, $2, 10, 0, null, null, null, null)", [p1.id, today], stranger)).rejects.toThrow("not_found");
    await expect(run("select public.cancel_installment_plan($1, 'x x x')", [plan], stranger)).rejects.toThrow("not_found");
    const seen = await run("select count(*)::int as n from installments where plan_id = $1", [plan], stranger);
    expect(seen.rows[0].n).toBe(0);
    await expect(run("update installments set expected_amount = 1 where id = $1", [p1.id])).rejects.toThrow(/permission denied/);
    await expect(run("update installment_plans set status = 'finished' where id = $1", [plan])).rejects.toThrow(/permission denied/);
    await expect(
      run("insert into installments (household_id, plan_id, number, due_date, expected_amount) values ($1, $2, 99, '2026-01-01', 1)", [household, plan]),
    ).rejects.toThrow(/permission denied/);
    const ok = await run("update installment_plans set description = 'Geladeira nova' where id = $1", [plan]);
    expect(ok.rowCount).toBe(1);
  });
});

describe("recorrências", () => {
  const horizon = () => addDays(today, 35);

  async function createRule(target: string, template: Record<string, unknown>, startsOn: string, day: number | null = null, frequency = "monthly", endsOn: string | null = null, requestId: string | null = null) {
    const { rows } = await run(
      "select public.create_recurrence($1, $2, 1, $3, $4, $5, $6, $7) as id",
      [target, frequency, day, startsOn, endsOn, JSON.stringify(template), requestId],
    );
    return rows[0].id as string;
  }

  it("conta mensal dia 31 gera exatamente as ocorrências previstas, sem duplicar", async () => {
    const startsOn = addMonthsClamped(today, -3, 1).slice(0, 8) + "01";
    const rule = await createRule("bill", { name: "Aluguel", amount: "1500.00", category_id: expenseCategory, fine_percent: "2", interest_rate: "1", interest_period: "monthly" }, startsOn, 31);
    const expected = occurrences({ frequency: "monthly", intervalCount: 1, dayOfMonth: 31, startsOn, endsOn: null }, startsOn, horizon());
    const bills = await db.query("select due_date::text as d, original_amount::text as a, status, fine_percent::text as f, interest_period from bills where recurrence_rule_id = $1 order by due_date", [rule]);
    expect(bills.rows.map((b) => b.d)).toEqual(expected);
    expect(bills.rows[0]).toMatchObject({ a: "1500.00", status: "pending", f: "2.0000", interest_period: "monthly" });

    const again = await run("select public.generate_recurrences() as n");
    expect(again.rows[0].n).toBe(0);
    const count = await db.query("select count(*)::int as n from bills where recurrence_rule_id = $1", [rule]);
    expect(count.rows[0].n).toBe(expected.length);
  });

  it("geração simultânea não duplica", async () => {
    const rule = await createRule("bill", { name: "Internet", amount: "99.90" }, addMonthsClamped(today, -6, 1).slice(0, 8) + "01", 15);
    await db.query("delete from audit_log where entity_id in (select id from bills where recurrence_rule_id = $1)", [rule]);
    // Apaga as geradas (como dono do banco) e gera em paralelo de duas conexões.
    await db.query("delete from bills where recurrence_rule_id = $1", [rule]);
    const [c1, c2] = await Promise.all([connect(), connect()]);
    await Promise.all([
      as(c1, { user }, (q) => q("select public.generate_recurrences()")),
      as(c2, { user }, (q) => q("select public.generate_recurrences()")),
    ]);
    const { rows } = await db.query("select due_date, count(*)::int as n from bills where recurrence_rule_id = $1 group by due_date having count(*) > 1", [rule]);
    expect(rows).toEqual([]);
  });

  it("receita recorrente gera lançamentos PREVISTOS", async () => {
    const rule = await createRule("income", { description: "Aposentadoria", amount: "1518.00", category_id: incomeCategory }, today, Number(today.slice(8)));
    const tx = await db.query("select status, type, amount::text as a, occurred_on::text as d from transactions where recurrence_rule_id = $1 order by occurred_on", [rule]);
    expect(tx.rows.length).toBeGreaterThanOrEqual(1);
    expect(tx.rows.every((t) => t.status === "planned" && t.type === "income" && t.a === "1518.00")).toBe(true);
    expect(tx.rows[0].d).toBe(today);
  });

  it("parar de repetir cancela só as futuras sem pagamento", async () => {
    const startsOn = addMonthsClamped(today, -2, 1).slice(0, 8) + "01";
    const day = 28;
    const rule = await createRule("bill", { name: "Escola", amount: "300.00" }, startsOn, day);
    const bills = (await db.query("select id, due_date::text as d from bills where recurrence_rule_id = $1 order by due_date", [rule])).rows;
    const past = bills.filter((b) => b.d <= today);
    const future = bills.filter((b) => b.d > today);
    expect(past.length).toBeGreaterThan(0);
    await run("select public.register_bill_payment($1, $2, 300, 0, null, null, null, null)", [past[0].id, today]);

    await run("select public.stop_recurrence($1)", [rule]);
    const after = (await db.query("select due_date::text as d, status from bills where recurrence_rule_id = $1 order by due_date", [rule])).rows;
    for (const b of after) {
      if (b.d > today) expect(b.status, b.d).toBe("canceled");
      else expect(b.status, b.d).not.toBe("canceled");
    }
    expect(future.length + past.length).toBe(after.length);
    const regen = await run("select public.generate_recurrences() as n");
    expect(regen.rows[0].n).toBe(0);
  });

  it("valida o modelo e a família", async () => {
    await expect(createRule("bill", { name: "", amount: "10" }, today, 10)).rejects.toThrow("invalid_recurrence");
    await expect(createRule("bill", { name: "x", amount: "10.555" }, today, 10)).rejects.toThrow("invalid_amount");
    await expect(createRule("bill", { name: "x", amount: "abc" }, today, 10)).rejects.toThrow("invalid_recurrence");
    await expect(createRule("income", { description: "x", amount: "10", category_id: expenseCategory }, today, 10)).rejects.toThrow("category_kind_mismatch");
    await expect(createRule("bill", { name: "x", amount: "10" }, today, 10, "weekly")).rejects.toThrow("invalid_recurrence");
    await expect(createRule("bill", { name: "x", amount: "10", interest_rate: "1" }, today, 10)).rejects.toThrow("invalid_rate");
    const strangerAccount = (await as(db, { user: stranger }, (q) => q("select id from accounts limit 1"))).rows[0].id;
    await expect(createRule("expense", { description: "x", amount: "10", account_id: strangerAccount }, today, 10)).rejects.toThrow("not_found");
    await expect(
      run("insert into recurrence_rules (household_id, target, frequency, day_of_month, starts_on) values ($1, 'bill', 'monthly', 1, $2)", [household, today]),
    ).rejects.toThrow(/permission denied/);
  });

  it("idempotente com o mesmo formulário", async () => {
    const requestId = randomUUID();
    const a = await createRule("expense", { description: "Academia", amount: "89.90" }, today, 5, "monthly", null, requestId);
    const b = await createRule("expense", { description: "Academia", amount: "89.90" }, today, 5, "monthly", null, requestId);
    expect(a).toBe(b);
  });

  it("outra família não para minha recorrência", async () => {
    const rule = await createRule("bill", { name: "Luz", amount: "100" }, today, 20);
    await expect(run("select public.stop_recurrence($1)", [rule], stranger)).rejects.toThrow("not_found");
  });
});
