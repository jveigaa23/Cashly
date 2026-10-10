import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePeriod } from "@/domain/reports";
import type { Membership } from "@/server/session";
import { clientFor, closeAdminDb, createItUser, type ItUser } from "./helpers";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const state: { client?: ReturnType<typeof clientFor>; membership?: Membership | null } = {};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/server/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/session")>()),
  requireMember: async () => state.membership,
  getMembership: async () => state.membership,
}));
vi.spyOn(console, "error").mockImplementation(() => {});

const actions = await import("@/server/finance/actions");
const budgets = await import("@/server/finance/budget-actions");
const reports = await import("@/server/finance/reports");
const { GET: csvGet } = await import("@/app/(app)/relatorios/csv/route");
const { NextRequest } = await import("next/server");

let user: ItUser;
let membership: Membership;
let categories: Record<string, string>;
let accountId: string;
const idle = { status: "idle" as const };
// Mês fixo no passado: os testes não dependem do relógio.
const TODAY = "2025-04-20";

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
const tx = (over: Record<string, string>) =>
  expectRedirect(
    actions.createTransactionAction(
      idle,
      form({
        type: "expense", status: "confirmed", description: "Lançamento", amount: "10,00", occurredOn: "2025-04-05",
        categoryId: "", accountId: "", paymentMethod: "", nature: "", notes: "", requestId: randomUUID(), ...over,
      }),
    ),
  );

beforeAll(async () => {
  user = await createItUser("Ana");
  const client = clientFor(user);
  const { data: householdId } = await client.rpc("create_household", { p_name: "Família Ana", p_display_name: "Ana" });
  const { data } = await client.from("household_members").select("id").eq("user_id", user.id).single();
  membership = { memberId: data!.id, householdId: householdId!, householdName: "Família Ana", timezone: "America/Sao_Paulo", role: "owner", displayName: "Ana" };
  const { data: cats } = await client.from("categories").select("id, name");
  categories = Object.fromEntries(cats!.map((c) => [c.name, c.id]));
  const { data: acc } = await client.from("accounts").select("id").single();
  accountId = acc!.id;

  state.client = client;
  state.membership = membership;
  // Março: 1 receita, 1 despesa. Abril: receitas/despesas pagas, previstas e cancelada.
  await tx({ type: "income", description: "Salário março", amount: "3.000,00", occurredOn: "2025-03-05", categoryId: categories["Salário"] });
  await tx({ description: "Mercado março", amount: "500,00", occurredOn: "2025-03-10", categoryId: categories["Alimentação"] });
  await tx({ type: "income", description: "Salário abril", amount: "3.200,00", occurredOn: "2025-04-05", categoryId: categories["Salário"] });
  await tx({ description: "Mercado abril", amount: "700,10", occurredOn: "2025-04-08", categoryId: categories["Alimentação"], paymentMethod: "Pix" });
  await tx({ description: "=HYPERLINK(\"x\")", amount: "99,90", occurredOn: "2025-04-09", categoryId: "" });
  await tx({ description: "Aluguel previsto", status: "planned", amount: "1.500,00", occurredOn: "2025-04-25", categoryId: categories["Moradia"] });
  const canceled = await tx({ description: "Cancelado", amount: "50,00", occurredOn: "2025-04-10", categoryId: categories["Alimentação"] });
  const canceledId = new URL(canceled, "http://x").searchParams.get("salvo")!;
  await expectRedirect(actions.cancelTransactionAction(canceledId, idle, form({ reason: "Lançado por engano" })));
});
afterAll(closeAdminDb);
beforeEach(() => {
  state.client = clientFor(user);
  state.membership = membership;
});

describe("painel", () => {
  it("totais do mês batem com os lançamentos (previstos e cancelados fora)", async () => {
    const d = await reports.loadDashboard("2025-04", TODAY);
    expect(d.current).toEqual({
      month: "2025-04",
      incomeCents: 320000,
      expenseCents: 80000,
      resultCents: 240000,
      plannedIncomeCents: 0,
      plannedExpenseCents: 150000,
    });
    expect(d.previous).toMatchObject({ month: "2025-03", incomeCents: 300000, expenseCents: 50000, resultCents: 250000 });
    expect(d.history.map((h) => h.month)).toEqual(["2024-11", "2024-12", "2025-01", "2025-02", "2025-03", "2025-04"]);
    expect(d.categories).toEqual([
      { categoryId: categories["Alimentação"], name: "Alimentação", cents: 70010, shareBp: 8751 },
      { categoryId: null, name: "Sem categoria", cents: 9990, shareBp: 1248 },
    ]);
    // Saldo registrado até "hoje": tudo realizado até 20/04.
    expect(d.balanceCents).toBe(300000 - 50000 + 320000 - 80000);
  });

  it("saldo inicial com data: lançamentos anteriores não contam para a conta", async () => {
    const r = await budgets.updateAccountAction(accountId, idle, form({ name: "Banco", openingBalance: "1.000,00", openingDate: "2025-04-01" }));
    expect(r).toMatchObject({ status: "success" });
    // Os lançamentos de teste não têm conta: continuam contando; o saldo inicial só entra a partir da data.
    expect(await reports.registeredBalance("2025-03-31")).toBe(250000);
    expect(await reports.registeredBalance("2025-04-20")).toBe(100000 + 490000);
    const missingDate = await budgets.updateAccountAction(accountId, idle, form({ name: "Banco", openingBalance: "10,00", openingDate: "" }));
    expect(missingDate).toMatchObject({ status: "error", fieldErrors: { openingDate: [expect.any(String)] } });
    await budgets.updateAccountAction(accountId, idle, form({ name: "Conta principal", openingBalance: "0", openingDate: "" }));
    expect(await reports.registeredBalance("2025-04-20")).toBe(490000);
  });

  it("lançamento com conta antes da data do saldo inicial não entra no saldo", async () => {
    await budgets.updateAccountAction(accountId, idle, form({ name: "Banco", openingBalance: "100,00", openingDate: "2025-02-15" }));
    await tx({ description: "Antes do saldo", amount: "30,00", occurredOn: "2025-02-01", accountId });
    expect(await reports.registeredBalance("2025-02-28")).toBe(10000);
    await budgets.updateAccountAction(accountId, idle, form({ name: "Conta principal", openingBalance: "0", openingDate: "" }));
    expect(await reports.registeredBalance("2025-02-28")).toBe(-3000);
  });
});

describe("orçamento", () => {
  it("salvar, atualizar, copiar e remover; consumo realizado e previsto separados", async () => {
    const path = await expectRedirect(
      budgets.saveBudgetAction(idle, form({ month: "2025-04", categoryId: categories["Alimentação"], limit: "800,00", alertPercent: "80" })),
    );
    expect(path).toBe("/orcamento?mes=2025-04&salvo=1");
    await expectRedirect(budgets.saveBudgetAction(idle, form({ month: "2025-04", categoryId: "", limit: "2.000,00", alertPercent: "90" })));
    // Atualiza o mesmo limite em vez de duplicar.
    await expectRedirect(budgets.saveBudgetAction(idle, form({ month: "2025-04", categoryId: categories["Alimentação"], limit: "750,00", alertPercent: "80" })));

    const d = await reports.loadDashboard("2025-04", TODAY);
    expect(d.budgets.map((b) => [b.categoryName, b.usage.limitCents, b.usage.spentCents, b.usage.plannedCents, b.usage.state])).toEqual([
      [null, 200000, 80000, 150000, "ok"],
      ["Alimentação", 75000, 70010, 0, "alert"],
    ]);

    const invalid = await budgets.saveBudgetAction(idle, form({ month: "2025-04", categoryId: "", limit: "0", alertPercent: "150" }));
    expect(invalid).toMatchObject({ status: "error" });
    expect(Object.keys((invalid as { fieldErrors: object }).fieldErrors)).toEqual(expect.arrayContaining(["limit", "alertPercent"]));

    expect(await expectRedirect(budgets.copyPreviousBudgetsAction("2025-05"))).toBe("/orcamento?mes=2025-05&copiado=1");
    const may = await reports.loadBudgets(["2025-05"], [], new Map());
    expect(may.map((b) => [b.categoryName, b.usage.limitCents])).toEqual([[null, 200000], ["Alimentação", 75000]]);

    for (const b of may) {
      const r = await budgets.removeBudgetAction(b.id, "2025-05").catch((e) => e);
      expect(r?.status === "error").toBe(false);
    }
    expect(await reports.loadBudgets(["2025-05"], [], new Map())).toEqual([]);
  });

  it("outra família não remove nem lê o orçamento", async () => {
    const [own] = await reports.loadBudgets(["2025-04"], [], new Map());
    const other = await createItUser("Bia");
    const otherClient = clientFor(other);
    await otherClient.rpc("create_household", { p_name: "Família Bia", p_display_name: "Bia" });
    const del = await otherClient.from("budgets").delete().eq("id", own.id).select("id");
    expect(del.data).toEqual([]);
    expect(await otherClient.from("budgets").select("id")).toMatchObject({ data: [] });
    expect((await reports.loadBudgets(["2025-04"], [], new Map())).length).toBe(2);
  });
});

describe("relatório e CSV", () => {
  it("relatório do trimestre soma os meses e calcula o saldo de cada fim de mês", async () => {
    const r = await reports.loadPeriodReport(parsePeriod("2025-T2")!, TODAY);
    expect(r.sum).toEqual({ incomeCents: 320000, expenseCents: 80000, resultCents: 240000, plannedIncomeCents: 0, plannedExpenseCents: 150000 });
    expect(r.openingBalanceCents).toBe(250000 - 3000);
    expect(r.balance).toEqual([
      { month: "2025-04", balanceCents: 247000 + 240000 },
      { month: "2025-05", balanceCents: null },
      { month: "2025-06", balanceCents: null },
    ]);
    expect(r.transactions.map((t) => t.description)).not.toContain("Cancelado");
  });

  it("CSV: resumo, lançamentos, escape de fórmulas e cabeçalhos", async () => {
    const res = await csvGet(new NextRequest("http://localhost/relatorios/csv?periodo=2025-04"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="cashly-2025-04.csv"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM: o Excel reconhece UTF-8
    const text = new TextDecoder().decode(bytes);
    const lines = text.split("\r\n");
    expect(lines).toContain("Receitas recebidas;3200,00");
    expect(lines).toContain("Despesas pagas;800,00");
    expect(lines).toContain("08/04/2025;Despesa;Paga;Mercado abril;Alimentação;Pix;700,10");
    expect(lines).toContain(`09/04/2025;Despesa;Paga;"'=HYPERLINK(""x"")";Sem categoria;;99,90`);
    expect(lines).toContain("25/04/2025;Despesa;Prevista;Aluguel previsto;Moradia;;1500,00");
    expect(text).not.toContain("Cancelado");
  });

  it("CSV exige login e período válido", async () => {
    state.membership = null;
    expect((await csvGet(new NextRequest("http://localhost/relatorios/csv?periodo=2025-04"))).status).toBe(401);
    state.membership = membership;
    expect((await csvGet(new NextRequest("http://localhost/relatorios/csv?periodo=abc"))).status).toBe(400);
  });
});
