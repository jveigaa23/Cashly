import "server-only";
import { summarizeBill, type BillStatus, type BillSummary } from "@/domain/bills";
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
}

const BILL_COLUMNS =
  "id, name, description, due_date, status, original_amount::text, category_id, canceled_at, cancel_reason, created_at, categories(name), bill_payments(id, paid_on, amount::text, principal_amount::text, charges_amount::text, note, canceled_at, cancel_reason, created_at)";

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
  categories: { name: string } | null;
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

  const items = data.slice(0, LIST_LIMIT).map((row) => {
    const facts = toBillFacts(row);
    return {
      id: row.id,
      name: row.name,
      categoryName: row.categories?.name ?? null,
      dueDate: row.due_date,
      status: facts.status,
      originalCents: facts.originalCents,
      summary: summarizeBill(facts, today),
    };
  });

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

  const facts = toBillFacts(data);
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    categoryId: data.category_id,
    categoryName: data.categories?.name ?? null,
    dueDate: data.due_date,
    status: facts.status,
    cancelReason: data.cancel_reason,
    originalCents: facts.originalCents,
    summary: summarizeBill(facts, today),
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
