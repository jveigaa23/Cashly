import "server-only";
import { summarizeBill } from "@/domain/bills";
import {
  budgetUsage,
  categoryBreakdown,
  monthlyTotals,
  monthsBetween,
  type BudgetUsage,
  type CategoryTotal,
  type MonthTotals,
  type TxFact,
} from "@/domain/reports";
import { addDays, addMonths, monthRange, type CalendarDate } from "@/lib/format/date";
import { decimalToCents } from "@/lib/format/money";
import { createClient } from "@/lib/supabase/server";
import { logServerError } from "../errors";

/**
 * Dados do painel e dos relatórios. Totais SEMPRE derivados dos registros
 * de origem (lançamentos realizados/previstos, contas, parcelas). Se o
 * volume passar do limite de segurança, a função falha de forma explícita
 * em vez de devolver totais incompletos.
 */

const PAGE = 1000;
const MAX_ROWS = 20_000;

function fail(context: string, error: { code?: string; message?: string }): never {
  logServerError(context, error);
  throw new Error("Não foi possível carregar os dados do relatório. Tente de novo em instantes.");
}

export interface ReportTx extends TxFact {
  id: string;
  description: string;
  paymentMethod: string | null;
  fromPayment: boolean;
}

/** Todos os lançamentos não cancelados do intervalo, paginando. */
export async function loadTransactions(start: CalendarDate, end: CalendarDate): Promise<ReportTx[]> {
  const supabase = await createClient();
  const rows: ReportTx[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, type, status, amount::text, occurred_on, description, payment_method, category_id, bill_payment_id, categories(name)")
      .gte("occurred_on", start)
      .lte("occurred_on", end)
      .neq("status", "canceled")
      .order("occurred_on")
      .order("id")
      .range(from, from + PAGE - 1)
      .overrideTypes<
        {
          id: string; type: string; status: string; amount: string; occurred_on: string; description: string;
          payment_method: string | null; category_id: string | null; bill_payment_id: string | null; categories: { name: string } | null;
        }[],
        { merge: false }
      >();
    if (error) fail("loadTransactions", error);
    for (const r of data) {
      rows.push({
        id: r.id,
        type: r.type === "income" ? "income" : "expense",
        status: r.status === "planned" ? "planned" : "confirmed",
        amountCents: decimalToCents(r.amount),
        occurredOn: r.occurred_on,
        description: r.description,
        paymentMethod: r.payment_method,
        categoryId: r.category_id,
        categoryName: r.categories?.name ?? null,
        fromPayment: r.bill_payment_id !== null,
      });
    }
    if (data.length < PAGE) break;
    if (rows.length >= MAX_ROWS) {
      throw new Error("Período com lançamentos demais para um relatório. Escolha um período menor.");
    }
  }
  return rows;
}

export async function registeredBalance(until: CalendarDate): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registered_balance", { p_until: until });
  if (error) fail("registeredBalance", error);
  return decimalToCents(String(data));
}

export interface BudgetRow {
  id: string;
  month: string;
  categoryId: string | null;
  categoryName: string | null;
  alertPercent: number;
  usage: BudgetUsage;
}

/** Orçamentos dos meses com consumo realizado e previsto separados. */
export async function loadBudgets(
  months: string[],
  txs: TxFact[],
  plannedBillsByMonthCategory: Map<string, number>,
): Promise<BudgetRow[]> {
  if (months.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budgets")
    .select("id, month, category_id, limit_amount::text, alert_percent, categories(name)")
    .gte("month", `${months[0]}-01`)
    .lte("month", `${months.at(-1)}-01`)
    .order("month")
    .overrideTypes<
      { id: string; month: string; category_id: string | null; limit_amount: string; alert_percent: number; categories: { name: string } | null }[],
      { merge: false }
    >();
  if (error) fail("loadBudgets", error);

  return data
    .map((b) => {
      const month = b.month.slice(0, 7);
      const matches = (t: TxFact) => t.type === "expense" && t.occurredOn.startsWith(month) && (b.category_id === null || t.categoryId === b.category_id);
      const spentCents = txs.filter((t) => t.status === "confirmed" && matches(t)).reduce((s, t) => s + t.amountCents, 0);
      const plannedTx = txs.filter((t) => t.status === "planned" && matches(t)).reduce((s, t) => s + t.amountCents, 0);
      const plannedBills = b.category_id === null
        ? [...plannedBillsByMonthCategory.entries()].filter(([k]) => k.startsWith(`${month}|`)).reduce((s, [, v]) => s + v, 0)
        : plannedBillsByMonthCategory.get(`${month}|${b.category_id}`) ?? 0;
      return {
        id: b.id,
        month,
        categoryId: b.category_id,
        categoryName: b.categories?.name ?? null,
        alertPercent: b.alert_percent,
        usage: budgetUsage({ limitCents: decimalToCents(b.limit_amount), spentCents, plannedCents: plannedTx + plannedBills, alertPercent: b.alert_percent }),
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month) || (a.categoryId === null ? -1 : b.categoryId === null ? 1 : (a.categoryName ?? "").localeCompare(b.categoryName ?? "", "pt-BR")));
}

export interface ObligationItem {
  kind: "bill" | "installment";
  id: string;
  href: string;
  name: string;
  dueDate: CalendarDate;
  outstandingCents: number;
  categoryId: string | null;
}

/** Contas e parcelas EM ABERTO (não é dinheiro gasto: são obrigações). */
export async function loadOpenObligations(): Promise<ObligationItem[]> {
  const supabase = await createClient();
  const [bills, installments] = await Promise.all([
    supabase
      .from("bills")
      .select("id, name, due_date, status, original_amount::text, category_id, bill_payments(principal_amount::text, canceled_at)")
      .in("status", ["pending", "partially_paid"])
      .order("due_date")
      .limit(MAX_ROWS)
      .overrideTypes<
        { id: string; name: string; due_date: string; status: string; original_amount: string; category_id: string | null; bill_payments: { principal_amount: string; canceled_at: string | null }[] }[],
        { merge: false }
      >(),
    supabase
      .from("installments")
      .select("id, number, due_date, expected_amount::text, plan_id, installment_plans!inner(description, installment_count, category_id, status), bill_payments(principal_amount::text, canceled_at)")
      .in("status", ["pending", "partially_paid"])
      .eq("installment_plans.status", "active")
      .order("due_date")
      .limit(MAX_ROWS)
      .overrideTypes<
        {
          id: string; number: number; due_date: string; expected_amount: string; plan_id: string;
          installment_plans: { description: string; installment_count: number; category_id: string | null; status: string };
          bill_payments: { principal_amount: string; canceled_at: string | null }[];
        }[],
        { merge: false }
      >(),
  ]);
  if (bills.error) fail("openBills", bills.error);
  if (installments.error) fail("openInstallments", installments.error);

  const paid = (ps: { principal_amount: string; canceled_at: string | null }[]) =>
    ps.filter((p) => !p.canceled_at).reduce((s, p) => s + decimalToCents(p.principal_amount), 0);

  return [
    ...bills.data.map((b) => ({
      kind: "bill" as const,
      id: b.id,
      href: `/contas/${b.id}`,
      name: b.name,
      dueDate: b.due_date,
      outstandingCents: decimalToCents(b.original_amount) - paid(b.bill_payments),
      categoryId: b.category_id,
    })),
    ...installments.data.map((i) => ({
      kind: "installment" as const,
      id: i.id,
      href: `/parcelas/${i.plan_id}`,
      name: `${i.installment_plans.description} (${i.number}/${i.installment_plans.installment_count})`,
      dueDate: i.due_date,
      outstandingCents: decimalToCents(i.expected_amount) - paid(i.bill_payments),
      categoryId: i.installment_plans.category_id,
    })),
  ]
    .filter((o) => o.outstandingCents > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name, "pt-BR"));
}

export function plannedByMonthCategory(obligations: ObligationItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const o of obligations) {
    const key = `${o.dueDate.slice(0, 7)}|${o.categoryId ?? ""}`;
    map.set(key, (map.get(key) ?? 0) + o.outstandingCents);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export interface DashboardData {
  month: string;
  balanceCents: number;
  current: MonthTotals;
  previous: MonthTotals;
  history: MonthTotals[];
  categories: CategoryTotal[];
  overdue: ObligationItem[];
  dueSoon: ObligationItem[];
  dueThisMonthCents: number;
  futureInstallmentsCents: number;
  futureInstallmentsCount: number;
  budgets: BudgetRow[];
}

export async function loadDashboard(month: string, today: CalendarDate): Promise<DashboardData> {
  const first = addMonths(month, -5);
  const { end } = monthRange(month);
  const historyMonths = monthsBetween(first, month);
  const [txs, obligations] = await Promise.all([
    loadTransactions(monthRange(first).start, end),
    loadOpenObligations(),
  ]);
  const balanceUntil = end < today ? end : today;
  const [balanceCents, budgets] = await Promise.all([
    registeredBalance(balanceUntil),
    loadBudgets([month], txs, plannedByMonthCategory(obligations)),
  ]);
  const history = monthlyTotals(txs, historyMonths);
  const { start: monthStart } = monthRange(month);
  const inMonth = txs.filter((t) => t.occurredOn >= monthStart);
  const soon = addDays(today, 7);
  const installmentsAfterToday = obligations.filter((o) => o.kind === "installment" && o.dueDate > today);

  return {
    month,
    balanceCents,
    current: history.at(-1)!,
    previous: history.at(-2)!,
    history,
    categories: categoryBreakdown(inMonth, "expense"),
    overdue: obligations.filter((o) => o.dueDate < today),
    dueSoon: obligations.filter((o) => o.dueDate >= today && o.dueDate <= soon),
    dueThisMonthCents: obligations.filter((o) => o.dueDate >= monthStart && o.dueDate <= end).reduce((s, o) => s + o.outstandingCents, 0),
    futureInstallmentsCents: installmentsAfterToday.reduce((s, o) => s + o.outstandingCents, 0),
    futureInstallmentsCount: installmentsAfterToday.length,
    budgets,
  };
}

// ---------------------------------------------------------------------------
// Relatório de período
// ---------------------------------------------------------------------------

export interface BillsReport {
  paid: { count: number; cents: number };
  pending: { count: number; cents: number };
  overdue: { count: number; cents: number };
  canceled: number;
}

async function loadBillsInPeriod(start: CalendarDate, end: CalendarDate, today: CalendarDate): Promise<BillsReport> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bills")
    .select("due_date, status, original_amount::text, bill_payments(amount::text, principal_amount::text, charges_amount::text, canceled_at)")
    .gte("due_date", start)
    .lte("due_date", end)
    .limit(MAX_ROWS)
    .overrideTypes<
      { due_date: string; status: string; original_amount: string; bill_payments: { amount: string; principal_amount: string; charges_amount: string; canceled_at: string | null }[] }[],
      { merge: false }
    >();
  if (error) fail("billsInPeriod", error);
  const report: BillsReport = { paid: { count: 0, cents: 0 }, pending: { count: 0, cents: 0 }, overdue: { count: 0, cents: 0 }, canceled: 0 };
  for (const b of data) {
    if (b.status === "canceled") {
      report.canceled++;
      continue;
    }
    const s = summarizeBill(
      {
        originalCents: decimalToCents(b.original_amount),
        dueDate: b.due_date,
        status: b.status as "pending",
        payments: b.bill_payments.map((p) => ({
          amountCents: decimalToCents(p.amount),
          principalCents: decimalToCents(p.principal_amount),
          chargesCents: decimalToCents(p.charges_amount),
          canceled: p.canceled_at !== null,
        })),
      },
      today,
    );
    if (s.outstandingCents === 0) {
      report.paid.count++;
      report.paid.cents += s.paidTotalCents;
    } else if (s.daysOverdue > 0) {
      report.overdue.count++;
      report.overdue.cents += s.outstandingCents;
    } else {
      report.pending.count++;
      report.pending.cents += s.outstandingCents;
    }
  }
  return report;
}

export interface InstallmentsReport {
  paidInPeriodCents: number;
  paidInPeriodCount: number;
  dueInPeriodOpenCents: number;
  dueInPeriodOpenCount: number;
  futureAfterPeriodCents: number;
}

async function loadInstallmentsReport(start: CalendarDate, end: CalendarDate, obligations: ObligationItem[]): Promise<InstallmentsReport> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bill_payments")
    .select("principal_amount::text")
    .not("installment_id", "is", null)
    .is("canceled_at", null)
    .gte("paid_on", start)
    .lte("paid_on", end)
    .limit(MAX_ROWS)
    .overrideTypes<{ principal_amount: string }[], { merge: false }>();
  if (error) fail("installmentsReport", error);
  const open = obligations.filter((o) => o.kind === "installment");
  const inPeriod = open.filter((o) => o.dueDate >= start && o.dueDate <= end);
  return {
    paidInPeriodCents: data.reduce((s, p) => s + decimalToCents(p.principal_amount), 0),
    paidInPeriodCount: data.length,
    dueInPeriodOpenCents: inPeriod.reduce((s, o) => s + o.outstandingCents, 0),
    dueInPeriodOpenCount: inPeriod.length,
    futureAfterPeriodCents: open.filter((o) => o.dueDate > end).reduce((s, o) => s + o.outstandingCents, 0),
  };
}

export interface PeriodReport {
  transactions: ReportTx[];
  totals: MonthTotals[];
  sum: Omit<MonthTotals, "month">;
  expenseCategories: CategoryTotal[];
  incomeCategories: CategoryTotal[];
  /** Saldo em cada fim de mês; mês atual até hoje; meses futuros ficam null (ainda não aconteceram). */
  balance: { month: string; balanceCents: number | null }[];
  openingBalanceCents: number;
  bills: BillsReport;
  installments: InstallmentsReport;
  budgets: BudgetRow[];
}

export async function loadPeriodReport(period: { start: CalendarDate; end: CalendarDate; months: string[] }, today: CalendarDate): Promise<PeriodReport> {
  const [transactions, obligations, openingBalanceCents, bills] = await Promise.all([
    loadTransactions(period.start, period.end),
    loadOpenObligations(),
    registeredBalance(addDays(period.start, -1)),
    loadBillsInPeriod(period.start, period.end, today),
  ]);
  const [installments, budgets] = await Promise.all([
    loadInstallmentsReport(period.start, period.end, obligations),
    loadBudgets(period.months, transactions, plannedByMonthCategory(obligations)),
  ]);
  // Saldo de cada fim de mês pela mesma função do banco (regra única).
  const balance = await Promise.all(
    period.months.map(async (month) => {
      const { start, end } = monthRange(month);
      if (start > today) return { month, balanceCents: null };
      return { month, balanceCents: await registeredBalance(end < today ? end : today) };
    }),
  );
  const totals = monthlyTotals(transactions, period.months);
  const sum = totals.reduce(
    (acc, t) => ({
      incomeCents: acc.incomeCents + t.incomeCents,
      expenseCents: acc.expenseCents + t.expenseCents,
      resultCents: acc.resultCents + t.resultCents,
      plannedIncomeCents: acc.plannedIncomeCents + t.plannedIncomeCents,
      plannedExpenseCents: acc.plannedExpenseCents + t.plannedExpenseCents,
    }),
    { incomeCents: 0, expenseCents: 0, resultCents: 0, plannedIncomeCents: 0, plannedExpenseCents: 0 },
  );
  return {
    transactions,
    totals,
    sum,
    expenseCategories: categoryBreakdown(transactions, "expense"),
    incomeCategories: categoryBreakdown(transactions, "income"),
    balance,
    openingBalanceCents,
    bills,
    installments,
    budgets,
  };
}
