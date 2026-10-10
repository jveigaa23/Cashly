import "server-only";
import { summarizeBill, type BillStatus, type BillSummary } from "@/domain/bills";
import { estimateCharges, type ChargeEstimate, type ChargeRules } from "@/domain/charges";
import { summarizePlan, type PlanSummary } from "@/domain/installments";
import { parseRate } from "@/domain/rates";
import type { RecurrenceRule } from "@/domain/recurrence";
import { totalsOf, type PeriodTotals, type TransactionStatus, type TransactionType } from "@/domain/transactions";
import { monthRange, type CalendarDate } from "@/lib/format/date";
import { decimalToCents } from "@/lib/format/money";
import { createClient } from "@/lib/supabase/server";
import { logServerError } from "../errors";
import type { Membership } from "../session";

/**
 * Leituras financeiras. Sempre com a sessão do usuário (RLS aplicado);
 * valores NUMERIC lidos como texto e convertidos para centavos sem float.
 * Falhas de leitura geram erro explícito (nunca lista vazia "de mentira").
 */

const LIST_LIMIT = 300;

function fail(context: string, error: { code?: string; message?: string }): never {
  logServerError(context, error);
  throw new Error("Não foi possível carregar os dados. Verifique a conexão e tente de novo.");
}

/** Escapa curingas do ILIKE para buscar o texto literal digitado. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export interface Option {
  id: string;
  name: string;
}

export async function listCategories(kind: "income" | "expense"): Promise<Option[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .eq("kind", kind)
    .is("archived_at", null)
    .order("name");
  if (error) fail("listCategories", error);
  return data;
}

export async function listAccounts(): Promise<Option[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("accounts").select("id, name").is("archived_at", null).order("name");
  if (error) fail("listAccounts", error);
  return data;
}

// ---------------------------------------------------------------------------
// Contas a pagar
// ---------------------------------------------------------------------------

export type BillView = "open" | "overdue" | "paid" | "canceled" | "all";
export type BillSort = "due" | "amount" | "name";

export interface BillListItem {
  id: string;
  name: string;
  categoryName: string | null;
  dueDate: CalendarDate;
  status: BillStatus;
  originalCents: number;
  summary: BillSummary;
  /** Regras de encargo configuradas (null = nenhuma). */
  chargeRules: ChargeRules | null;
  /** Estimativa até hoje (só quando há regras e atraso). Não é valor oficial. */
  charges: ChargeEstimate | null;
  recurrence: (RecurrenceRule & { id: string; active: boolean }) | null;
}

function chargeRulesOf(row: BillRow): ChargeRules | null {
  const fineMicro = parseRate(row.fine_percent) ?? 0n;
  const interestMicro = parseRate(row.interest_rate) ?? 0n;
  if (fineMicro === 0n && interestMicro === 0n) return null;
  return {
    fineMicro,
    interestMicro,
    interestPeriod: row.interest_period === "daily" || row.interest_period === "monthly" ? row.interest_period : null,
    basis: row.interest_basis === "outstanding" ? "outstanding" : "original",
  };
}

function toBillItem(row: BillRow, today: CalendarDate): BillListItem {
  const facts = toBillFacts(row);
  const summary = summarizeBill(facts, today);
  const chargeRules = chargeRulesOf(row);
  const charges =
    chargeRules && facts.status !== "canceled" && (summary.daysOverdue > 0 || summary.paidChargesCents > 0)
      ? estimateCharges({
          originalCents: facts.originalCents,
          dueDate: row.due_date,
          rules: chargeRules,
          referenceDate: today,
          payments: row.bill_payments
            .filter((p) => !p.canceled_at)
            .map((p) => ({ paidOn: p.paid_on, principalCents: decimalToCents(p.principal_amount), chargesCents: decimalToCents(p.charges_amount) })),
        })
      : null;
  const r = row.recurrence_rules;
  return {
    id: row.id,
    name: row.name,
    categoryName: row.categories?.name ?? null,
    dueDate: row.due_date,
    status: facts.status,
    originalCents: facts.originalCents,
    summary,
    chargeRules,
    charges,
    recurrence: r
      ? {
          id: r.id,
          active: r.active,
          frequency: r.frequency === "yearly" ? "yearly" : "monthly",
          intervalCount: r.interval_count,
          dayOfMonth: r.day_of_month,
          startsOn: r.starts_on,
          endsOn: r.ends_on,
        }
      : null,
  };
}

const BILL_COLUMNS =
  "id, name, description, due_date, status, original_amount::text, category_id, canceled_at, cancel_reason, created_at, fine_percent::text, interest_rate::text, interest_period, interest_basis, recurrence_rule_id, categories(name), recurrence_rules(id, frequency, interval_count, day_of_month, starts_on, ends_on, active), bill_payments(id, paid_on, amount::text, principal_amount::text, charges_amount::text, note, canceled_at, cancel_reason, created_at)";

type BillRow = {
  id: string;
  name: string;
  description: string | null;
  due_date: string;
  status: string;
  original_amount: string;
  category_id: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  fine_percent: string;
  interest_rate: string;
  interest_period: string | null;
  interest_basis: string;
  recurrence_rule_id: string | null;
  categories: { name: string } | null;
  recurrence_rules: {
    id: string;
    frequency: string;
    interval_count: number;
    day_of_month: number | null;
    starts_on: string;
    ends_on: string | null;
    active: boolean;
  } | null;
  bill_payments: {
    id: string;
    paid_on: string;
    amount: string;
    principal_amount: string;
    charges_amount: string;
    note: string | null;
    canceled_at: string | null;
    cancel_reason: string | null;
    created_at: string;
  }[];
};

function toBillFacts(row: BillRow) {
  return {
    originalCents: decimalToCents(row.original_amount),
    dueDate: row.due_date,
    status: row.status as BillStatus,
    payments: row.bill_payments.map((p) => ({
      amountCents: decimalToCents(p.amount),
      principalCents: decimalToCents(p.principal_amount),
      chargesCents: decimalToCents(p.charges_amount),
      canceled: p.canceled_at !== null,
    })),
  };
}

export async function listBills(
  filter: { view: BillView; q?: string; sort: BillSort },
  today: CalendarDate,
): Promise<{ items: BillListItem[]; truncated: boolean }> {
  const supabase = await createClient();
  let query = supabase.from("bills").select(BILL_COLUMNS);

  if (filter.view === "open") query = query.in("status", ["pending", "partially_paid"]);
  if (filter.view === "overdue") query = query.in("status", ["pending", "partially_paid"]).lt("due_date", today);
  if (filter.view === "paid") query = query.eq("status", "paid");
  if (filter.view === "canceled") query = query.eq("status", "canceled");
  if (filter.q?.trim()) query = query.ilike("name", likePattern(filter.q.trim()));

  const descending = filter.view === "paid" || filter.view === "canceled" || filter.view === "all";
  query = query.order("due_date", { ascending: !descending }).order("name").limit(LIST_LIMIT + 1);

  const { data, error } = await query.overrideTypes<BillRow[], { merge: false }>();
  if (error) fail("listBills", error);

  const items = data.slice(0, LIST_LIMIT).map((row) => toBillItem(row, today));

  if (filter.sort === "amount") items.sort((a, b) => b.summary.outstandingCents - a.summary.outstandingCents || b.originalCents - a.originalCents);
  if (filter.sort === "name") items.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return { items, truncated: data.length > LIST_LIMIT };
}

export interface BillPaymentView {
  id: string;
  paidOn: CalendarDate;
  amountCents: number;
  principalCents: number;
  chargesCents: number;
  note: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
}

export interface BillDetail extends BillListItem {
  description: string | null;
  categoryId: string | null;
  cancelReason: string | null;
  payments: BillPaymentView[];
  /** Valores crus para preencher o formulário de edição. */
  finePercent: string;
  interestRate: string;
  interestPeriod: "daily" | "monthly" | null;
  interestBasis: "original" | "outstanding";
}

export async function getBill(id: string, today: CalendarDate): Promise<BillDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bills")
    .select(BILL_COLUMNS)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<BillRow | null, { merge: false }>();
  if (error) fail("getBill", error);
  if (!data) return null;

  return {
    ...toBillItem(data, today),
    description: data.description,
    categoryId: data.category_id,
    cancelReason: data.cancel_reason,
    finePercent: data.fine_percent,
    interestRate: data.interest_rate,
    interestPeriod: data.interest_period === "daily" || data.interest_period === "monthly" ? data.interest_period : null,
    interestBasis: data.interest_basis === "outstanding" ? "outstanding" : "original",
    payments: data.bill_payments
      .map((p) => ({
        id: p.id,
        paidOn: p.paid_on,
        amountCents: decimalToCents(p.amount),
        principalCents: decimalToCents(p.principal_amount),
        chargesCents: decimalToCents(p.charges_amount),
        note: p.note,
        canceledAt: p.canceled_at,
        cancelReason: p.cancel_reason,
      }))
      .sort((a, b) => b.paidOn.localeCompare(a.paidOn)),
  };
}

// ---------------------------------------------------------------------------
// Lançamentos
// ---------------------------------------------------------------------------

export interface TransactionItem {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  amountCents: number;
  occurredOn: CalendarDate;
  description: string;
  notes: string | null;
  categoryId: string | null;
  categoryName: string | null;
  accountId: string | null;
  paymentMethod: string | null;
  nature: "fixed" | "variable" | null;
  billPaymentId: string | null;
  billId: string | null;
  cancelReason: string | null;
}

const TX_COLUMNS =
  "id, type, status, amount::text, occurred_on, description, notes, category_id, account_id, payment_method, nature, bill_payment_id, cancel_reason, categories(name), bill_payments(bill_id)";

type TxRow = {
  id: string;
  type: string;
  status: string;
  amount: string;
  occurred_on: string;
  description: string;
  notes: string | null;
  category_id: string | null;
  account_id: string | null;
  payment_method: string | null;
  nature: string | null;
  bill_payment_id: string | null;
  cancel_reason: string | null;
  categories: { name: string } | null;
  bill_payments: { bill_id: string | null } | null;
};

function toTransaction(row: TxRow): TransactionItem {
  return {
    id: row.id,
    type: row.type as TransactionType,
    status: row.status as TransactionStatus,
    amountCents: decimalToCents(row.amount),
    occurredOn: row.occurred_on,
    description: row.description,
    notes: row.notes,
    categoryId: row.category_id,
    categoryName: row.categories?.name ?? null,
    accountId: row.account_id,
    paymentMethod: row.payment_method,
    nature: row.nature === "fixed" || row.nature === "variable" ? row.nature : null,
    billPaymentId: row.bill_payment_id,
    billId: row.bill_payments?.bill_id ?? null,
    cancelReason: row.cancel_reason,
  };
}

export interface TransactionFilter {
  month: string;
  type?: TransactionType;
  categoryId?: string;
  q?: string;
  showCanceled?: boolean;
}

export async function listTransactions(
  filter: TransactionFilter,
): Promise<{ items: TransactionItem[]; totals: PeriodTotals; truncated: boolean }> {
  const { start, end } = monthRange(filter.month);
  const supabase = await createClient();
  let query = supabase.from("transactions").select(TX_COLUMNS).gte("occurred_on", start).lte("occurred_on", end);
  if (filter.type) query = query.eq("type", filter.type);
  if (filter.categoryId) query = query.eq("category_id", filter.categoryId);
  if (filter.q?.trim()) query = query.ilike("description", likePattern(filter.q.trim()));
  if (!filter.showCanceled) query = query.neq("status", "canceled");

  const { data, error } = await query
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT + 1)
    .overrideTypes<TxRow[], { merge: false }>();
  if (error) fail("listTransactions", error);

  const truncated = data.length > LIST_LIMIT;
  const items = data.slice(0, LIST_LIMIT).map(toTransaction);
  return { items, totals: totalsOf(items), truncated };
}

export async function getTransaction(id: string): Promise<TransactionItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(TX_COLUMNS)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<TxRow | null, { merge: false }>();
  if (error) fail("getTransaction", error);
  return data ? toTransaction(data) : null;
}

// ---------------------------------------------------------------------------
// Histórico (audit_log)
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  id: number;
  at: string;
  entity: string;
  action: "insert" | "update";
  actorName: string;
  changes: Record<string, unknown>;
}

export async function getHistory(entityIds: string[], membership: Membership): Promise<HistoryEntry[]> {
  if (entityIds.length === 0) return [];
  const supabase = await createClient();
  const [log, members] = await Promise.all([
    supabase
      .from("audit_log")
      .select("id, at, entity, action, actor_id, changes")
      .in("entity_id", entityIds)
      .order("at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100),
    supabase.from("household_members").select("user_id, display_name").eq("household_id", membership.householdId),
  ]);
  if (log.error) fail("getHistory", log.error);
  if (members.error) fail("getHistory members", members.error);

  const names = new Map(members.data.map((m) => [m.user_id, m.display_name]));
  return log.data.map((row) => ({
    id: row.id,
    at: row.at,
    entity: row.entity,
    action: row.action === "insert" ? "insert" : "update",
    actorName: (row.actor_id && names.get(row.actor_id)) || "Sistema",
    changes: (row.changes ?? {}) as Record<string, unknown>,
  }));
}

// ---------------------------------------------------------------------------
// Recorrências
// ---------------------------------------------------------------------------

/**
 * Gera as ocorrências recorrentes pendentes (idempotente). Chamado ao abrir as
 * telas de contas/lançamentos/início. Falha é informada, nunca escondida.
 */
export async function ensureRecurrences(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("generate_recurrences");
  if (error) {
    logServerError("generate_recurrences", error);
    return { ok: false };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Parcelamentos
// ---------------------------------------------------------------------------

export interface InstallmentView {
  id: string;
  number: number;
  dueDate: CalendarDate;
  expectedCents: number;
  paidPrincipalCents: number;
  status: "pending" | "partially_paid" | "paid" | "canceled";
  payments: BillPaymentView[];
}

export interface PlanView {
  id: string;
  kind: "purchase" | "loan" | "other";
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  totalCents: number;
  count: number;
  firstDueDate: CalendarDate;
  interestMethod: "none" | "simple_monthly";
  interestRate: string;
  status: "active" | "finished" | "canceled";
  cancelReason: string | null;
  summary: PlanSummary;
  installments: InstallmentView[];
}

const PLAN_COLUMNS =
  "id, kind, description, category_id, total_amount::text, installment_count, first_due_date, interest_method, interest_rate::text, status, cancel_reason, categories(name), installments(id, number, due_date, expected_amount::text, status, bill_payments(id, paid_on, amount::text, principal_amount::text, charges_amount::text, note, canceled_at, cancel_reason))";

type PlanRow = {
  id: string;
  kind: string;
  description: string;
  category_id: string | null;
  total_amount: string;
  installment_count: number;
  first_due_date: string;
  interest_method: string;
  interest_rate: string;
  status: string;
  cancel_reason: string | null;
  categories: { name: string } | null;
  installments: {
    id: string;
    number: number;
    due_date: string;
    expected_amount: string;
    status: string;
    bill_payments: BillRow["bill_payments"];
  }[];
};

function toPlan(row: PlanRow, today: CalendarDate): PlanView {
  const installments: InstallmentView[] = row.installments
    .map((i) => {
      const payments = i.bill_payments.map((p) => ({
        id: p.id,
        paidOn: p.paid_on,
        amountCents: decimalToCents(p.amount),
        principalCents: decimalToCents(p.principal_amount),
        chargesCents: decimalToCents(p.charges_amount),
        note: p.note,
        canceledAt: p.canceled_at,
        cancelReason: p.cancel_reason,
      }));
      return {
        id: i.id,
        number: i.number,
        dueDate: i.due_date,
        expectedCents: decimalToCents(i.expected_amount),
        paidPrincipalCents: payments.filter((p) => !p.canceledAt).reduce((s, p) => s + p.principalCents, 0),
        status: i.status as InstallmentView["status"],
        payments: payments.sort((a, b) => b.paidOn.localeCompare(a.paidOn)),
      };
    })
    .sort((a, b) => a.number - b.number);
  return {
    id: row.id,
    kind: row.kind === "loan" ? "loan" : row.kind === "other" ? "other" : "purchase",
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.categories?.name ?? null,
    totalCents: decimalToCents(row.total_amount),
    count: row.installment_count,
    firstDueDate: row.first_due_date,
    interestMethod: row.interest_method === "simple_monthly" ? "simple_monthly" : "none",
    interestRate: row.interest_rate,
    status: row.status as PlanView["status"],
    cancelReason: row.cancel_reason,
    summary: summarizePlan(installments, today),
    installments,
  };
}

export async function listPlans(today: CalendarDate, view: "active" | "all" = "active"): Promise<PlanView[]> {
  const supabase = await createClient();
  let query = supabase.from("installment_plans").select(PLAN_COLUMNS);
  if (view === "active") query = query.eq("status", "active");
  const { data, error } = await query.order("created_at", { ascending: false }).limit(LIST_LIMIT).overrideTypes<PlanRow[], { merge: false }>();
  if (error) fail("listPlans", error);
  return data.map((row) => toPlan(row, today));
}

export async function getPlan(id: string, today: CalendarDate): Promise<PlanView | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("installment_plans")
    .select(PLAN_COLUMNS)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<PlanRow | null, { merge: false }>();
  if (error) fail("getPlan", error);
  return data ? toPlan(data, today) : null;
}
