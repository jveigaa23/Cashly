import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSchedule } from "@/domain/installments";
import { occurrences } from "@/domain/recurrence";
import { addDays } from "@/lib/format/date";
import type { Membership } from "@/server/session";
import { clientFor, closeAdminDb, createItUser, type ItUser } from "./helpers";

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
const { todayFor } = await import("@/server/session");

let user: ItUser;
let membership: Membership;
let today: string;
const idle = { status: "idle" as const };

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
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
const billForm = (over: Record<string, string>) =>
  form({
    name: "Conta", amount: "100,00", dueDate: today, categoryId: "", description: "",
    finePercent: "", interestRate: "", interestPeriod: "", interestBasis: "original",
    repeat: "", repeatUntil: "", requestId: randomUUID(), ...over,
  });

beforeAll(async () => {
  user = await createItUser("Ana");
  const client = clientFor(user);
  const { data: householdId } = await client.rpc("create_household", { p_name: "Família Ana", p_display_name: "Ana" });
  const { data } = await client.from("household_members").select("id").eq("user_id", user.id).single();
  membership = { memberId: data!.id, householdId: householdId!, householdName: "Família Ana", timezone: "America/Sao_Paulo", role: "owner", displayName: "Ana" };
  today = todayFor(membership);
});
afterAll(closeAdminDb);
beforeEach(() => {
  state.client = clientFor(user);
  state.membership = membership;
});

describe("encargos estimados", () => {
  it("conta vencida com multa e juros mostra a estimativa separada do valor original", async () => {
    const due = addDays(today, -30);
    const path = await expectRedirect(
      actions.createBillAction(idle, billForm({ name: "Cartão", amount: "1.000,00", dueDate: due, finePercent: "2", interestRate: "1", interestPeriod: "monthly" })),
    );
    const bill = await queries.getBill(path.split("/")[2].split("?")[0], today);
    expect(bill).toMatchObject({ originalCents: 100000, summary: { daysOverdue: 30, outstandingCents: 100000 } });
    expect(bill!.charges).toMatchObject({ fineCents: 2000, interestCents: 1000, totalDueCents: 103000 });
    expect(bill!.finePercent).toBe("2.0000");
  });

  it("sem regras configuradas não há estimativa", async () => {
    const path = await expectRedirect(actions.createBillAction(idle, billForm({ dueDate: addDays(today, -5) })));
    const bill = await queries.getBill(path.split("/")[2].split("?")[0], today);
    expect(bill!.chargeRules).toBeNull();
    expect(bill!.charges).toBeNull();
  });

  it("juros sem período são recusados no formulário", async () => {
    const result = await actions.createBillAction(idle, billForm({ interestRate: "1" }));
    expect(result.fieldErrors?.interestPeriod).toBeTruthy();
  });
});

describe("contas recorrentes", () => {
  it("cria a regra, gera as ocorrências até ~35 dias à frente e não duplica ao gerar de novo", async () => {
    const start = addDays(today, -40);
    const path = await expectRedirect(actions.createBillAction(idle, billForm({ name: "Água mensal", amount: "80,00", dueDate: start, repeat: "monthly" })));
    expect(path).toBe("/contas?ver=open&recorrente=1");

    const expected = occurrences({ frequency: "monthly", intervalCount: 1, dayOfMonth: Number(start.slice(8)), startsOn: start, endsOn: null }, start, addDays(today, 35));
    const list = async () => (await queries.listBills({ view: "all", q: "Água mensal", sort: "due" }, today)).items;
    expect((await list()).map((b) => b.dueDate).sort()).toEqual(expected);
    expect((await list())[0].recurrence).toMatchObject({ frequency: "monthly", active: true });

    expect((await queries.ensureRecurrences()).ok).toBe(true);
    expect((await list()).length).toBe(expected.length);
  });

  it("parar de repetir cancela as futuras", async () => {
    const path = await expectRedirect(actions.createBillAction(idle, billForm({ name: "Escola mensal", dueDate: addDays(today, 3), repeat: "monthly" })));
    expect(path).toContain("recorrente=1");
    const [first] = (await queries.listBills({ view: "open", q: "Escola mensal", sort: "due" }, today)).items;
    await expectRedirect(actions.stopRecurrenceAction(first.id, first.recurrence!.id));
    const after = await queries.getBill(first.id, today);
    expect(after).toMatchObject({ status: "canceled", recurrence: { active: false } });
  });

  it("receita mensal gera previstos", async () => {
    await expectRedirect(
      actions.createTransactionAction(
        idle,
        form({ type: "income", status: "confirmed", description: "Aposentadoria", amount: "1.518,00", occurredOn: today, categoryId: "", accountId: "", paymentMethod: "", nature: "", notes: "", repeatMonthly: "on", requestId: randomUUID() }),
      ),
    );
    const { items, totals } = await queries.listTransactions({ month: today.slice(0, 7), q: "Aposentadoria" });
    expect(items[0]).toMatchObject({ status: "planned", amountCents: 151800 });
    expect(totals.incomeCents).toBe(0);
    expect(totals.plannedIncomeCents).toBeGreaterThanOrEqual(151800);
  });
});

describe("parcelamentos", () => {
  const planForm = (over: Record<string, string> = {}) =>
    form({ description: "Geladeira", kind: "purchase", categoryId: "", total: "1.000,00", count: "3", firstDueDate: today, method: "none", rate: "", requestId: randomUUID(), ...over });

  it("cria plano com o mesmo cronograma do domínio", async () => {
    const path = await expectRedirect(actions.createPlanAction(idle, planForm({ total: "1.000,01", count: "3", method: "simple_monthly", rate: "1,5" })));
    const plan = await queries.getPlan(path.split("/")[2].split("?")[0], today);
    const expected = buildSchedule({ totalCents: 100001, count: 3, firstDueDate: today, method: "simple_monthly", rateMicro: 1_500_000n });
    expect(plan!.installments.map((i) => ({ number: i.number, dueDate: i.dueDate, amountCents: i.expectedCents }))).toEqual(expected);
    expect(plan!.summary).toMatchObject({ openCount: 3, paidCount: 0, remainingCents: 104501 });
  });

  it("paga parcelas, termina o plano e cancela pagamento", async () => {
    const path = await expectRedirect(actions.createPlanAction(idle, planForm({ total: "200,00", count: "2" })));
    const planId = path.split("/")[2].split("?")[0];
    let plan = await queries.getPlan(planId, today);
    const payForm = (amount: string) =>
      form({ amount, charges: "", paidOn: today, accountId: "", paymentMethod: "", note: "", requestId: randomUUID() });

    const over = await actions.payInstallmentAction(planId, plan!.installments[0].id, idle, payForm("100,01"));
    expect(over.fieldErrors?.amount).toBeTruthy();

    await expectRedirect(actions.payInstallmentAction(planId, plan!.installments[0].id, idle, payForm("100,00")));
    await expectRedirect(actions.payInstallmentAction(planId, plan!.installments[1].id, idle, payForm("100,00")));
    plan = await queries.getPlan(planId, today);
    expect(plan).toMatchObject({ status: "finished", summary: { paidCount: 2, openCount: 0, remainingCents: 0 } });

    const payment = plan!.installments[1].payments[0];
    await expectRedirect(actions.cancelInstallmentPaymentAction(planId, payment.id, idle, form({ reason: "Engano" })));
    plan = await queries.getPlan(planId, today);
    expect(plan).toMatchObject({ status: "active", summary: { openCount: 1, remainingCents: 10000 } });

    const tx = await queries.listTransactions({ month: today.slice(0, 7), q: "Parcela 1/2: Geladeira" });
    expect(tx.items).toHaveLength(1);
  });

  it("formulário reenviado não cria dois planos", async () => {
    const f = planForm({ description: "Sofá" });
    const a = await expectRedirect(actions.createPlanAction(idle, f));
    const b = await expectRedirect(actions.createPlanAction(idle, f));
    expect(a).toBe(b);
    expect((await queries.listPlans(today, "all")).filter((p) => p.description === "Sofá")).toHaveLength(1);
  });
});
