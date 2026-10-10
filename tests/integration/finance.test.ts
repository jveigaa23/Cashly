import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Membership } from "@/server/session";
import { adminDb, clientFor, closeAdminDb, createItUser, type ItUser } from "./helpers";

// Só a sessão e o cache do Next são substituídos; banco, RLS, funções e
// PostgREST são reais.
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const state: { client?: ReturnType<typeof clientFor>; membership?: Membership } = {};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/server/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/session")>()),
  requireMember: async () => state.membership,
}));
vi.spyOn(console, "error").mockImplementation(() => {});

const actions = await import("@/server/finance/actions");
const queries = await import("@/server/finance/queries");

const TODAY = new Date().toISOString().slice(0, 10);
const MONTH = TODAY.slice(0, 7);

let alice: ItUser;
let bob: ItUser;
let aliceMembership: Membership;
let bobMembership: Membership;
let expenseCategory: string;
let incomeCategory: string;

async function setupFamily(user: ItUser): Promise<Membership> {
  const client = clientFor(user);
  const { data: householdId, error } = await client.rpc("create_household", { p_name: `Família ${user.name}`, p_display_name: user.name });
  if (error) throw error;
  const { data } = await client.from("household_members").select("id").eq("user_id", user.id).single();
  return {
    memberId: data!.id,
    householdId: householdId!,
    householdName: `Família ${user.name}`,
    timezone: "America/Sao_Paulo",
    role: "owner",
    displayName: user.name,
  };
}

function as(user: ItUser, membership: Membership) {
  state.client = clientFor(user);
  state.membership = membership;
}

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

/** Ações bem-sucedidas terminam em redirect (exceção NEXT_REDIRECT do Next). */
async function expectRedirect(promise: Promise<unknown>): Promise<string> {
  try {
    const result = await promise;
    throw new Error(`Esperava redirect, recebeu ${JSON.stringify(result)}`);
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (!digest.startsWith("NEXT_REDIRECT")) throw error;
    return digest.split(";")[2];
  }
}

const idle = { status: "idle" as const };

beforeAll(async () => {
  alice = await createItUser("Alice");
  bob = await createItUser("Bob");
  aliceMembership = await setupFamily(alice);
  bobMembership = await setupFamily(bob);
  as(alice, aliceMembership);
  expenseCategory = (await state.client!.from("categories").select("id").eq("name", "Contas de consumo").single()).data!.id;
  incomeCategory = (await state.client!.from("categories").select("id").eq("name", "Salário").single()).data!.id;
});
afterAll(closeAdminDb);
beforeEach(() => as(alice, aliceMembership));

async function createBill(name: string, amount: string, dueDate = TODAY) {
  const path = await expectRedirect(
    actions.createBillAction(idle, form({ name, amount, dueDate, categoryId: expenseCategory, description: "" })),
  );
  return path.replace(/^\/contas\//, "").replace(/\?.*$/, "");
}

const payForm = (amount: string, extra: Record<string, string> = {}) =>
  form({ amount, charges: "", paidOn: TODAY, accountId: "", paymentMethod: "Pix", note: "", requestId: randomUUID(), ...extra });

describe("contas a pagar (ações + consultas reais)", () => {
  it("cria conta com valor pt-BR e lê de volta em centavos exatos", async () => {
    const id = await createBill("Energia", "1.234,56");
    const bill = await queries.getBill(id, TODAY);
    expect(bill).toMatchObject({
      name: "Energia",
      originalCents: 123456,
      categoryName: "Contas de consumo",
      status: "pending",
      summary: { situation: "due_today", outstandingCents: 123456 },
    });
  });

  it("formulário inválido devolve erros por campo e não grava nada", async () => {
    const result = await actions.createBillAction(idle, form({ name: "", amount: "12,345", dueDate: "", categoryId: "", description: "" }));
    expect(result.status).toBe("error");
    expect(Object.keys(result.fieldErrors ?? {})).toEqual(["name", "amount", "dueDate"]);
    expect(result.values?.amount).toBe("12,345");
  });

  it("pagamento parcial, encargos e quitação atualizam conta e lançamentos", async () => {
    const id = await createBill("Água", "100,00");
    expect(await expectRedirect(actions.payBillAction(id, idle, payForm("40,00")))).toBe(`/contas/${id}?pago=1`);
    let bill = await queries.getBill(id, TODAY);
    expect(bill!.summary).toMatchObject({ situation: "partially_paid", outstandingCents: 6000, paidPrincipalCents: 4000 });

    await expectRedirect(actions.payBillAction(id, idle, payForm("65,50", { charges: "5,50" })));
    bill = await queries.getBill(id, TODAY);
    expect(bill!.status).toBe("paid");
    expect(bill!.summary).toMatchObject({ outstandingCents: 0, paidChargesCents: 550, paidTotalCents: 10550 });
    expect(bill!.payments.map((p) => p.amountCents).sort()).toEqual([4000, 6550]);

    const { items } = await queries.listTransactions({ month: MONTH, q: "Pagamento: Água" });
    expect(items.map((t) => t.amountCents).sort()).toEqual([4000, 6550]);
    expect(items.every((t) => t.billId === id && t.type === "expense" && t.status === "confirmed")).toBe(true);
  });

  it("valor acima do saldo é recusado com mensagem no campo", async () => {
    const id = await createBill("Gás", "50,00");
    const result = await actions.payBillAction(id, idle, payForm("50,01"));
    expect(result.fieldErrors?.amount?.[0]).toMatch(/maior que o que falta pagar/);
    expect((await queries.getBill(id, TODAY))!.payments).toHaveLength(0);
  });

  it("formulário de pagamento reenviado não duplica", async () => {
    const id = await createBill("Internet", "120,00");
    const f = payForm("20,00");
    await expectRedirect(actions.payBillAction(id, idle, f));
    await expectRedirect(actions.payBillAction(id, idle, f));
    expect((await queries.getBill(id, TODAY))!.payments).toHaveLength(1);
  });

  it("cancelar pagamento reabre a conta e tira a despesa dos totais", async () => {
    const id = await createBill("Telefone", "80,00");
    await expectRedirect(actions.payBillAction(id, idle, payForm("80,00")));
    const payment = (await queries.getBill(id, TODAY))!.payments[0];

    const noReason = await actions.cancelPaymentAction(id, payment.id, idle, form({ reason: "" }));
    expect(noReason.fieldErrors?.reason).toBeTruthy();

    await expectRedirect(actions.cancelPaymentAction(id, payment.id, idle, form({ reason: "Paguei na conta errada" })));
    const bill = await queries.getBill(id, TODAY);
    expect(bill!.status).toBe("pending");
    expect(bill!.payments[0].cancelReason).toBe("Paguei na conta errada");

    const visible = await queries.listTransactions({ month: MONTH, q: "Pagamento: Telefone" });
    expect(visible.items).toHaveLength(0);
    const all = await queries.listTransactions({ month: MONTH, q: "Pagamento: Telefone", showCanceled: true });
    expect(all.items[0].status).toBe("canceled");
  });

  it("conta com pagamento não pode ser cancelada; mensagem explica o que fazer", async () => {
    const id = await createBill("Condomínio", "500,00");
    await expectRedirect(actions.payBillAction(id, idle, payForm("100,00")));
    const result = await actions.cancelBillAction(id, idle, form({ reason: "Não devo mais" }));
    expect(result.message).toMatch(/Cancele os pagamentos/);
  });

  it("editar valor recalcula o status; abaixo do pago é recusado", async () => {
    const id = await createBill("IPTU", "300,00");
    await expectRedirect(actions.payBillAction(id, idle, payForm("300,00")));
    await expectRedirect(actions.updateBillAction(id, idle, form({ name: "IPTU 2026", amount: "350,00", dueDate: TODAY, categoryId: expenseCategory, description: "" })));
    expect((await queries.getBill(id, TODAY))!.status).toBe("partially_paid");
    const result = await actions.updateBillAction(id, idle, form({ name: "IPTU", amount: "100,00", dueDate: TODAY, categoryId: expenseCategory, description: "" }));
    expect(result.message).toMatch(/menor que o total já pago/);
  });

  it("listagem: filtros por situação, busca literal e ordenação", async () => {
    await createBill("Seguro 100% carro", "10,00", "2020-01-10");
    const overdue = await queries.listBills({ view: "overdue", sort: "due" }, TODAY);
    expect(overdue.items.some((b) => b.name === "Seguro 100% carro" && b.summary.situation === "overdue")).toBe(true);
    const search = await queries.listBills({ view: "all", q: "100%", sort: "due" }, TODAY);
    expect(search.items.map((b) => b.name)).toEqual(["Seguro 100% carro"]);
    const literal = await queries.listBills({ view: "all", q: "%", sort: "due" }, TODAY);
    expect(literal.items.every((b) => b.name.includes("%"))).toBe(true);
    const paid = await queries.listBills({ view: "paid", sort: "name" }, TODAY);
    expect(paid.items.every((b) => b.status === "paid")).toBe(true);
  });

  it("histórico registra criação, pagamento e alteração com o nome de quem fez", async () => {
    const id = await createBill("Academia", "90,00");
    await expectRedirect(actions.payBillAction(id, idle, payForm("90,00")));
    const bill = await queries.getBill(id, TODAY);
    const history = await queries.getHistory([id, ...bill!.payments.map((p) => p.id)], aliceMembership);
    expect(history.map((h) => `${h.entity}:${h.action}`)).toEqual(
      expect.arrayContaining(["bills:insert", "bill_payments:insert", "bills:update"]),
    );
    expect(new Set(history.map((h) => h.actorName))).toEqual(new Set(["Alice"]));
  });
});

describe("lançamentos", () => {
  it("receitas e despesas, previstas e realizadas, com totais do filtro", async () => {
    const month = "2025-03";
    const mk = (fields: Record<string, string>) =>
      expectRedirect(
        actions.createTransactionAction(
          idle,
          form({ status: "confirmed", categoryId: "", accountId: "", paymentMethod: "", nature: "", notes: "", requestId: randomUUID(), ...fields }),
        ),
      );
    await mk({ type: "income", description: "Aposentadoria", amount: "3.000,00", occurredOn: `${month}-05`, categoryId: incomeCategory });
    await mk({ type: "income", description: "Aluguel recebido", amount: "800,00", occurredOn: `${month}-20`, status: "planned" });
    await mk({ type: "expense", description: "Feira", amount: "120,35", occurredOn: `${month}-07`, paymentMethod: "Dinheiro", nature: "variable" });
    await mk({ type: "expense", description: "Farmácia", amount: "49,90", occurredOn: `${month}-31` });
    await mk({ type: "expense", description: "Fora do mês", amount: "1,00", occurredOn: "2025-04-01" });

    const { items, totals } = await queries.listTransactions({ month });
    expect(items).toHaveLength(4);
    expect(totals).toEqual({ incomeCents: 300000, expenseCents: 17025, resultCents: 282975, plannedIncomeCents: 80000, plannedExpenseCents: 0 });

    const expenses = await queries.listTransactions({ month, type: "expense" });
    expect(expenses.totals.incomeCents).toBe(0);
    expect(expenses.items.map((t) => t.description).sort()).toEqual(["Farmácia", "Feira"]);
    const byCategory = await queries.listTransactions({ month, categoryId: incomeCategory });
    expect(byCategory.items.map((t) => t.description)).toEqual(["Aposentadoria"]);
  });

  it("mesmo formulário de lançamento enviado duas vezes cria um só", async () => {
    const f = form({ type: "expense", status: "confirmed", description: "Pão", amount: "8,50", occurredOn: "2025-05-02", categoryId: "", accountId: "", paymentMethod: "", nature: "", notes: "", requestId: randomUUID() });
    await expectRedirect(actions.createTransactionAction(idle, f));
    await expectRedirect(actions.createTransactionAction(idle, f));
    const { items } = await queries.listTransactions({ month: "2025-05", q: "Pão" });
    expect(items).toHaveLength(1);
  });

  it("despesa de pagamento: edição só muda descrição/categoria/observação", async () => {
    const id = await createBill("Luz casa", "70,00");
    await expectRedirect(actions.payBillAction(id, idle, payForm("70,00")));
    const tx = (await queries.listTransactions({ month: MONTH, q: "Pagamento: Luz casa" })).items[0];
    await expectRedirect(
      actions.updateTransactionAction(tx.id, idle, form({ status: "confirmed", description: "Luz (Enel)", amount: "1,00", occurredOn: "2020-01-01", categoryId: expenseCategory, accountId: "", paymentMethod: "", nature: "", notes: "boleto" })),
    );
    const after = await queries.getTransaction(tx.id);
    expect(after).toMatchObject({ description: "Luz (Enel)", amountCents: 7000, occurredOn: TODAY, notes: "boleto" });
  });

  it("cancelar lançamento avulso exige motivo e o tira dos totais", async () => {
    await expectRedirect(actions.createTransactionAction(idle, form({ type: "expense", status: "confirmed", description: "Duplicado", amount: "10,00", occurredOn: "2025-06-10", categoryId: "", accountId: "", paymentMethod: "", nature: "", notes: "", requestId: randomUUID() })));
    const tx = (await queries.listTransactions({ month: "2025-06" })).items[0];
    await expectRedirect(actions.cancelTransactionAction(tx.id, idle, form({ reason: "Lancei duas vezes" })));
    const { items, totals } = await queries.listTransactions({ month: "2025-06" });
    expect(items).toHaveLength(0);
    expect(totals.expenseCents).toBe(0);
  });
});

describe("isolamento entre famílias pelas ações", () => {
  it("Bob não lê nem paga a conta de Alice", async () => {
    const id = await createBill("Privada da Alice", "10,00");
    as(bob, bobMembership);
    expect(await queries.getBill(id, TODAY)).toBeNull();
    const result = await actions.payBillAction(id, idle, payForm("10,00"));
    expect(result.message).toMatch(/não encontrado/);
    const list = await queries.listBills({ view: "all", sort: "due" }, TODAY);
    expect(list.items.some((b) => b.id === id)).toBe(false);
  });

  it("household_id do formulário é ignorado: vem da sessão", async () => {
    as(bob, bobMembership);
    const f = form({ name: "Tentativa", amount: "1,00", dueDate: TODAY, categoryId: "", description: "", household_id: aliceMembership.householdId });
    const path = await expectRedirect(actions.createBillAction(idle, f));
    const id = path.replace(/^\/contas\//, "").replace(/\?.*$/, "");
    const db = await adminDb();
    const { rows } = await db.query("select household_id from bills where id = $1", [id]);
    expect(rows[0].household_id).toBe(bobMembership.householdId);
  });
});
