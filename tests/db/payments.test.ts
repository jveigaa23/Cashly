import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createHousehold, createTestDatabase, createUser, type TestUser } from "./helpers";

let db: Client;
let drop: () => Promise<void>;
let connect: () => Promise<Client>;
let user: TestUser;
let stranger: TestUser;
let household: string;
let expenseCategory: string;
let incomeCategory: string;
let account: string;

const TODAY = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  ({ db, drop, connect } = await createTestDatabase());
  user = await createUser(db);
  stranger = await createUser(db);
  household = await createHousehold(db, user);
  await createHousehold(db, stranger);
  await as(db, { user }, async (q) => {
    expenseCategory = (await q("select id from categories where kind = 'expense' limit 1")).rows[0].id;
    incomeCategory = (await q("select id from categories where kind = 'income' limit 1")).rows[0].id;
    account = (await q("select id from accounts limit 1")).rows[0].id;
  });
});
afterAll(async () => drop());

const run = (sql: string, params: unknown[] = [], who: TestUser = user) => as(db, { user: who }, (q) => q(sql, params));

async function newBill(amount = "100.00") {
  const { rows } = await run(
    "insert into bills (household_id, name, original_amount, due_date, category_id) values ($1, 'Luz', $2, '2026-10-10', $3) returning id",
    [household, amount, expenseCategory],
  );
  return rows[0].id as string;
}

function pay(bill: string, amount: string, charges = "0", opts: { requestId?: string; who?: TestUser; paidOn?: string } = {}) {
  return run(
    "select public.register_bill_payment($1, $2, $3, $4, $5, 'Pix', null, $6) as id",
    [bill, opts.paidOn ?? "2026-10-08", amount, charges, account, opts.requestId ?? null],
    opts.who ?? user,
  ).then((r) => r.rows[0].id as string);
}

const billRow = (id: string) => db.query("select status, original_amount::text from bills where id = $1", [id]).then((r) => r.rows[0]);
const expensesOf = (paymentId: string) =>
  db.query("select amount::text, status, type, category_id, account_id, payment_method from transactions where bill_payment_id = $1", [paymentId]).then((r) => r.rows);

describe("pagamento de contas", () => {
  it("pagamento integral quita a conta e gera UMA despesa vinculada", async () => {
    const bill = await newBill();
    const payment = await pay(bill, "100.00");
    expect(await billRow(bill)).toMatchObject({ status: "paid" });
    expect(await expensesOf(payment)).toEqual([
      { amount: "100.00", status: "confirmed", type: "expense", category_id: expenseCategory, account_id: account, payment_method: "Pix" },
    ]);
  });

  it("pagamentos parciais atualizam o status até quitar", async () => {
    const bill = await newBill("300.00");
    await pay(bill, "100.00");
    expect((await billRow(bill)).status).toBe("partially_paid");
    await pay(bill, "150.00");
    expect((await billRow(bill)).status).toBe("partially_paid");
    await pay(bill, "50.00");
    expect((await billRow(bill)).status).toBe("paid");
  });

  it("encargos (juros/multa) entram no valor pago mas não abatem o principal", async () => {
    const bill = await newBill("100.00");
    const payment = await pay(bill, "112.30", "12.30");
    const { rows } = await db.query("select amount::text, principal_amount::text, charges_amount::text from bill_payments where id = $1", [payment]);
    expect(rows[0]).toEqual({ amount: "112.30", principal_amount: "100.00", charges_amount: "12.30" });
    expect((await billRow(bill)).status).toBe("paid");
    expect((await expensesOf(payment))[0].amount).toBe("112.30");
  });

  it("não aceita pagar principal acima do saldo", async () => {
    const bill = await newBill("100.00");
    await pay(bill, "60.00");
    await expect(pay(bill, "40.01")).rejects.toThrow("payment_exceeds_outstanding");
    await expect(pay(bill, "45.00", "5.00")).resolves.toBeTruthy();
  });

  it("valida valores, datas e estados", async () => {
    const bill = await newBill("100.00");
    await expect(pay(bill, "0")).rejects.toThrow("invalid_amount");
    await expect(pay(bill, "-10")).rejects.toThrow("invalid_amount");
    await expect(pay(bill, "10.555")).rejects.toThrow("invalid_amount");
    await expect(pay(bill, "10.00", "10.00")).rejects.toThrow("invalid_amount");
    await expect(pay(bill, "10.00", "0", { paidOn: "2999-01-01" })).rejects.toThrow("paid_on_in_future");
    await expect(pay(bill, "10.00", "0", { paidOn: TODAY })).resolves.toBeTruthy();

    await pay(bill, "90.00");
    await expect(pay(bill, "1.00")).rejects.toThrow("bill_already_paid");
  });

  it("mesmo formulário enviado duas vezes não duplica (idempotência)", async () => {
    const bill = await newBill("100.00");
    const requestId = randomUUID();
    const first = await pay(bill, "30.00", "0", { requestId });
    const second = await pay(bill, "30.00", "0", { requestId });
    expect(second).toBe(first);
    const { rows } = await db.query("select count(*)::int as n from bill_payments where bill_id = $1", [bill]);
    expect(rows[0].n).toBe(1);
    expect(await expensesOf(first)).toHaveLength(1);
  });

  it("dois pagamentos simultâneos não ultrapassam o saldo", async () => {
    const bill = await newBill("100.00");
    const [c1, c2] = await Promise.all([connect(), connect()]);
    const attempt = (c: Client) =>
      as(c, { user }, (q) =>
        q("select public.register_bill_payment($1, '2026-10-08', 80, 0, null, null, null, null)", [bill]),
      ).then(() => "ok", (e: Error) => e.message);
    const results = await Promise.all([attempt(c1), attempt(c2)]);
    expect(results.sort()).toEqual(["ok", "payment_exceeds_outstanding"]);
    const { rows } = await db.query("select sum(principal_amount)::text as s from bill_payments where bill_id = $1 and canceled_at is null", [bill]);
    expect(rows[0].s).toBe("80.00");
  });

  it("outra família não paga nem vê a conta", async () => {
    const bill = await newBill();
    await expect(pay(bill, "10.00", "0", { who: stranger })).rejects.toThrow("not_found");
  });

  it("conta de outra família não pode ser debitada da minha conta bancária e vice-versa", async () => {
    const { rows } = await as(db, { user: stranger }, (q) => q("select id from accounts limit 1"));
    const bill = await newBill();
    await expect(
      run("select public.register_bill_payment($1, '2026-10-08', 10, 0, $2, null, null, null)", [bill, rows[0].id]),
    ).rejects.toThrow(/foreign key/);
  });
});

describe("cancelamentos", () => {
  it("cancelar pagamento cancela a despesa e recalcula a conta", async () => {
    const bill = await newBill("100.00");
    const p1 = await pay(bill, "40.00");
    const p2 = await pay(bill, "60.00");
    expect((await billRow(bill)).status).toBe("paid");

    await expect(run("select public.cancel_bill_payment($1, '')", [p2])).rejects.toThrow("reason_required");
    await run("select public.cancel_bill_payment($1, 'Digitei errado')", [p2]);
    expect((await billRow(bill)).status).toBe("partially_paid");
    expect((await expensesOf(p2))[0].status).toBe("canceled");
    expect((await expensesOf(p1))[0].status).toBe("confirmed");
    await expect(run("select public.cancel_bill_payment($1, 'de novo')", [p2])).rejects.toThrow("payment_canceled");

    await run("select public.cancel_bill_payment($1, 'Digitei errado')", [p1]);
    expect((await billRow(bill)).status).toBe("pending");
  });

  it("conta com pagamento ativo não pode ser cancelada; sem pagamento, pode", async () => {
    const bill = await newBill();
    const payment = await pay(bill, "10.00");
    await expect(run("select public.cancel_bill($1, 'Não devo mais')", [bill])).rejects.toThrow("bill_has_payments");
    await run("select public.cancel_bill_payment($1, 'Errado')", [payment]);
    await run("select public.cancel_bill($1, 'Não devo mais')", [bill]);
    expect((await billRow(bill)).status).toBe("canceled");
    await expect(run("update bills set name = 'x' where id = $1", [bill])).rejects.toThrow("bill_canceled");
    await expect(pay(bill, "1.00")).rejects.toThrow("bill_canceled");
  });

  it("lançamento avulso é cancelado com motivo; vinculado a pagamento, não", async () => {
    const { rows } = await run(
      "insert into transactions (household_id, type, amount, occurred_on, description) values ($1, 'expense', 25, '2026-10-01', 'Padaria') returning id",
      [household],
    );
    await run("select public.cancel_transaction($1, 'Lançado duas vezes')", [rows[0].id]);
    const tx = await db.query("select status, cancel_reason, canceled_at is not null as has_date from transactions where id = $1", [rows[0].id]);
    expect(tx.rows[0]).toEqual({ status: "canceled", cancel_reason: "Lançado duas vezes", has_date: true });

    const bill = await newBill();
    const payment = await pay(bill, "10.00");
    const linked = (await db.query("select id from transactions where bill_payment_id = $1", [payment])).rows[0].id;
    await expect(run("select public.cancel_transaction($1, 'teste')", [linked])).rejects.toThrow("linked_to_payment");
  });

  it("outra família não cancela nada meu", async () => {
    const bill = await newBill();
    const payment = await pay(bill, "10.00");
    await expect(run("select public.cancel_bill_payment($1, 'invasão')", [payment], stranger)).rejects.toThrow("not_found");
    await expect(run("select public.cancel_bill($1, 'invasão')", [bill], stranger)).rejects.toThrow("not_found");
  });
});

describe("o cliente não altera status nem vínculos diretamente", () => {
  it("não grava status/cancelamento de contas", async () => {
    const bill = await newBill();
    await expect(run("update bills set status = 'paid' where id = $1", [bill])).rejects.toThrow(/permission denied/);
    await expect(run("update bills set canceled_at = now() where id = $1", [bill])).rejects.toThrow(/permission denied/);
    await expect(
      run("insert into bills (household_id, name, original_amount, due_date, status) values ($1, 'x', 1, '2026-10-10', 'paid')", [household]),
    ).rejects.toThrow(/permission denied/);
  });

  it("não cria pagamentos diretamente", async () => {
    const bill = await newBill();
    await expect(
      run("insert into bill_payments (household_id, bill_id, paid_on, amount, principal_amount) values ($1, $2, '2026-10-08', 100, 100)", [household, bill]),
    ).rejects.toThrow(/permission denied/);
  });

  it("não cria lançamento cancelado nem vinculado a pagamento", async () => {
    await expect(
      run("insert into transactions (household_id, type, status, amount, occurred_on, description) values ($1, 'expense', 'canceled', 1, '2026-10-01', 'x')", [household]),
    ).rejects.toThrow("use_cancel_function");
  });

  it("não cancela lançamento por update; previsto pode virar realizado", async () => {
    const { rows } = await run(
      "insert into transactions (household_id, type, status, amount, occurred_on, description, category_id) values ($1, 'income', 'planned', 3000, '2026-10-05', 'Salário', $2) returning id",
      [household, incomeCategory],
    );
    await expect(run("update transactions set status = 'canceled' where id = $1", [rows[0].id])).rejects.toThrow("use_cancel_function");
    const ok = await run("update transactions set status = 'confirmed' where id = $1", [rows[0].id]);
    expect(ok.rowCount).toBe(1);
  });

  it("despesa vinculada a pagamento: valor e data só mudam cancelando o pagamento", async () => {
    const bill = await newBill();
    const payment = await pay(bill, "50.00");
    const linked = (await db.query("select id from transactions where bill_payment_id = $1", [payment])).rows[0].id;
    await expect(run("update transactions set amount = 1 where id = $1", [linked])).rejects.toThrow("linked_to_payment");
    const ok = await run("update transactions set notes = 'boleto da Enel' where id = $1", [linked]);
    expect(ok.rowCount).toBe(1);
  });

  it("categoria precisa ser do tipo certo", async () => {
    await expect(
      run("insert into transactions (household_id, type, amount, occurred_on, description, category_id) values ($1, 'expense', 1, '2026-10-01', 'x', $2)", [household, incomeCategory]),
    ).rejects.toThrow("category_kind_mismatch");
    await expect(
      run("insert into bills (household_id, name, original_amount, due_date, category_id) values ($1, 'x', 1, '2026-10-10', $2)", [household, incomeCategory]),
    ).rejects.toThrow("category_kind_mismatch");
  });

  it("alterar o valor original recalcula o status; não pode ficar abaixo do já pago", async () => {
    const bill = await newBill("100.00");
    await pay(bill, "100.00");
    await run("update bills set original_amount = 150 where id = $1", [bill]);
    expect(await billRow(bill)).toEqual({ status: "partially_paid", original_amount: "150.00" });
    await expect(run("update bills set original_amount = 90 where id = $1", [bill])).rejects.toThrow("amount_below_paid");
    await run("update bills set original_amount = 100 where id = $1", [bill]);
    expect((await billRow(bill)).status).toBe("paid");
  });
});

describe("totais sem dupla contagem", () => {
  it("despesas efetivas = pagamentos ativos + despesas avulsas; contas pendentes não entram", async () => {
    const fresh = await createUser(db);
    const h = await createHousehold(db, fresh);
    const q = (sql: string, params: unknown[] = []) => as(db, { user: fresh }, (c) => c(sql, params));

    const paidBill = (await q("insert into bills (household_id, name, original_amount, due_date) values ($1, 'Água', 80, '2026-10-05') returning id", [h])).rows[0].id;
    await q("insert into bills (household_id, name, original_amount, due_date) values ($1, 'Internet', 120, '2026-10-20')", [h]);
    await q("select public.register_bill_payment($1, '2026-10-05', 80, 0, null, null, null, null)", [paidBill]);
    const canceled = (await q("select public.register_bill_payment($1, '2026-10-05', 5, 5, null, null, null, null) as id", [paidBill]).catch(() => ({ rows: [] }))).rows;
    expect(canceled).toEqual([]); // conta já quitada não recebe outro pagamento
    await q("insert into transactions (household_id, type, amount, occurred_on, description) values ($1, 'expense', 30.50, '2026-10-06', 'Feira')", [h]);
    await q("insert into transactions (household_id, type, status, amount, occurred_on, description) values ($1, 'expense', 'planned', 999, '2026-10-30', 'Previsto')", [h]);

    const { rows } = await q(
      "select coalesce(sum(amount), 0)::text as total from transactions where type = 'expense' and status = 'confirmed' and occurred_on between '2026-10-01' and '2026-10-31'",
    );
    expect(rows[0].total).toBe("110.50");
  });
});
