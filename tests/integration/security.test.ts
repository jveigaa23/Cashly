import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Membership } from "@/server/session";
import { adminDb, clientFor, closeAdminDb, createItUser, type ItUser } from "./helpers";

/**
 * Fase 7 — segurança das Server Actions: uma pessoa de outra família tenta
 * agir sobre registros da família A usando os ids certos. Nada pode mudar,
 * e a tela não pode dizer que deu certo.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const state: { client?: ReturnType<typeof clientFor>; membership?: Membership } = {};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/server/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/session")>()),
  requireMember: async () => state.membership,
  getMembership: async () => state.membership,
}));
vi.spyOn(console, "error").mockImplementation(() => {});

const actions = await import("@/server/finance/actions");
const budgets = await import("@/server/finance/budget-actions");
const notifications = await import("@/server/notifications/actions");
const { GET: csvGet } = await import("@/app/(app)/relatorios/csv/route");
const { NextRequest } = await import("next/server");

interface Family { user: ItUser; membership: Membership }
let a: Family;
let b: Family;
let ids: { bill: string; tx: string; budget: string; account: string; plan: string; installment: string; notice: string };
const idle = { status: "idle" as const };

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
async function family(name: string): Promise<Family> {
  const user = await createItUser(name);
  const client = clientFor(user);
  const { data: householdId } = await client.rpc("create_household", { p_name: `Família ${name}`, p_display_name: name });
  const { data } = await client.from("household_members").select("id").eq("user_id", user.id).single();
  return { user, membership: { memberId: data!.id, householdId: householdId!, householdName: `Família ${name}`, timezone: "America/Sao_Paulo", role: "owner", displayName: name } };
}
const as = (f: Family) => {
  state.client = clientFor(f.user);
  state.membership = f.membership;
};
/** Resultado de uma ação: estado devolvido ou o destino do redirect. */
async function outcome(p: Promise<unknown>): Promise<{ redirect?: string; status?: string }> {
  try {
    return (await p) as { status?: string };
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return { redirect: digest.split(";")[2] };
    throw error;
  }
}

beforeAll(async () => {
  a = await family("Ana");
  b = await family("Beto");
  const db = await adminDb();
  const q = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0].id as string;
  const h = a.membership.householdId;
  const bill = await q("insert into bills (household_id, name, original_amount, due_date) values ($1, 'Luz', 100, current_date + 1) returning id", [h]);
  const tx = await q("insert into transactions (household_id, type, status, amount, occurred_on, description) values ($1, 'expense', 'confirmed', 50, current_date, 'Mercado da Ana') returning id", [h]);
  const budget = await q("insert into budgets (household_id, month, limit_amount) values ($1, date_trunc('month', current_date), 500) returning id", [h]);
  const account = await q("select id from accounts where household_id = $1", [h]);
  as(a);
  const { data: plan } = await state.client!.rpc("create_installment_plan", {
    p_kind: "purchase", p_description: "TV", p_category_id: null, p_total: 1000, p_count: 2, p_first_due: "2030-01-10", p_method: "none", p_rate: 0, p_request_id: randomUUID(),
  });
  const installment = await q("select id from installments where plan_id = $1 and number = 1", [plan]);
  await state.client!.rpc("refresh_notifications");
  const notice = await q("select id from notification_deliveries where household_id = $1 limit 1", [h]);
  ids = { bill, tx, budget, account, plan: plan!, installment, notice };
  as(b);
});
afterAll(closeAdminDb);

describe("outra família, ids certos: nada muda e nada diz que deu certo", () => {
  it("contas a pagar: editar, pagar e cancelar", async () => {
    const billForm = { name: "Hackeada", amount: "1,00", dueDate: "2030-01-01", categoryId: "", description: "", finePercent: "", interestRate: "", interestPeriod: "", interestBasis: "original", repeat: "", repeatUntil: "" };
    expect(await outcome(actions.updateBillAction(ids.bill, idle, form(billForm)))).toMatchObject({ status: "error" });
    expect(await outcome(actions.payBillAction(ids.bill, idle, form({ amount: "100,00", charges: "", paidOn: "2026-01-01", accountId: "", paymentMethod: "", note: "", requestId: randomUUID() })))).toMatchObject({ status: "error" });
    expect(await outcome(actions.cancelBillAction(ids.bill, idle, form({ reason: "tentativa" })))).toMatchObject({ status: "error" });
    const { rows } = await (await adminDb()).query("select name, status from bills where id = $1", [ids.bill]);
    expect(rows[0]).toEqual({ name: "Luz", status: "pending" });
  });

  it("lançamentos: editar e cancelar", async () => {
    expect(await outcome(actions.cancelTransactionAction(ids.tx, idle, form({ reason: "tentativa" })))).toMatchObject({ status: "error" });
    const { rows } = await (await adminDb()).query("select status from transactions where id = $1", [ids.tx]);
    expect(rows[0].status).toBe("confirmed");
  });

  it("parcelamento: pagar parcela e cancelar plano", async () => {
    expect(
      await outcome(actions.payInstallmentAction(ids.plan, ids.installment, idle, form({ amount: "500,00", charges: "", paidOn: "2026-01-01", accountId: "", paymentMethod: "", note: "", requestId: randomUUID() }))),
    ).toMatchObject({ status: "error" });
    expect(await outcome(actions.cancelPlanAction(ids.plan, idle, form({ reason: "tentativa" })))).toMatchObject({ status: "error" });
    const { rows } = await (await adminDb()).query("select status from installment_plans where id = $1", [ids.plan]);
    expect(rows[0].status).toBe("active");
  });

  it("orçamento e conta de registro", async () => {
    expect(await outcome(budgets.removeBudgetAction(ids.budget, "2026-10"))).toMatchObject({ status: "error" });
    expect(await outcome(budgets.updateAccountAction(ids.account, idle, form({ name: "X", openingBalance: "999,00", openingDate: "2026-01-01" })))).toMatchObject({ status: "error" });
    const db = await adminDb();
    expect((await db.query("select count(*)::int as n from budgets where id = $1", [ids.budget])).rows[0].n).toBe(1);
    expect((await db.query("select name, opening_balance::text as b from accounts where id = $1", [ids.account])).rows[0]).toEqual({ name: "Conta principal", b: "0.00" });
  });

  it("aviso de outra pessoa continua não lido", async () => {
    await notifications.markNotificationReadAction(ids.notice);
    const { rows } = await (await adminDb()).query("select status from notification_deliveries where id = $1", [ids.notice]);
    expect(rows[0].status).not.toBe("read");
  });

  it("planilha (CSV) só traz dados da própria família", async () => {
    const month = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
    const text = await (await csvGet(new NextRequest(`http://localhost/relatorios/csv?periodo=${month}`))).text();
    expect(text).not.toContain("Mercado da Ana");
  });
});

describe("campos forjados no formulário são ignorados", () => {
  it("household_id/created_by enviados no formulário não mudam a família da conta criada", async () => {
    const f = form({
      name: "Conta do Beto", amount: "10,00", dueDate: "2030-01-01", categoryId: "", description: "", finePercent: "", interestRate: "",
      interestPeriod: "", interestBasis: "original", repeat: "", repeatUntil: "", requestId: randomUUID(),
      household_id: a.membership.householdId, householdId: a.membership.householdId, created_by: a.user.id,
    });
    const r = await outcome(actions.createBillAction(idle, f));
    expect(r.redirect).toMatch(/^\/contas\//);
    const { rows } = await (await adminDb()).query("select household_id, created_by from bills where name = 'Conta do Beto'");
    expect(rows).toEqual([{ household_id: b.membership.householdId, created_by: b.user.id }]);
  });

  it("categoria de outra família é recusada", async () => {
    const { rows } = await (await adminDb()).query("select id from categories where household_id = $1 and kind = 'expense' limit 1", [a.membership.householdId]);
    const f = form({
      name: "Com categoria alheia", amount: "10,00", dueDate: "2030-01-01", categoryId: rows[0].id, description: "", finePercent: "", interestRate: "",
      interestPeriod: "", interestBasis: "original", repeat: "", repeatUntil: "", requestId: randomUUID(),
    });
    expect(await outcome(actions.createBillAction(idle, f))).toMatchObject({ status: "error" });
  });
});
