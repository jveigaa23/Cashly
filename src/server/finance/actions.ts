"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/form-message";
import { checkPayment } from "@/domain/bills";
import { dbMoney, dbRate } from "@/lib/supabase/money";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/auth";
import { billSchema, cancelSchema, paymentSchema, planSchema, transactionSchema } from "@/lib/validation/finance";
import { logServerError, rpcErrorMessage } from "../errors";
import { requireMember, todayFor } from "../session";
import { getBill, getPlan, getTransaction } from "./queries";

/**
 * Ações financeiras. Regras em todas:
 * - household_id e autor vêm da sessão, nunca do formulário;
 * - validação no servidor (Zod + domínio) e de novo no banco (RLS, funções);
 * - dinheiro vai ao banco como decimal exato gerado a partir de centavos;
 * - erro nunca vira "sucesso": a pessoa vê a mensagem e os dados digitados.
 */

const text = (form: FormData, key: string) => String(form.get(key) ?? "");
const values = (form: FormData, keys: string[]) => Object.fromEntries(keys.map((k) => [k, text(form, k)]));
const invalid = (error: z.ZodError, v: Record<string, string>): FormState => ({
  status: "error",
  message: "Confira os campos destacados.",
  fieldErrors: fieldErrors(error),
  values: v,
});
const dbError = (context: string, error: { code?: string; message?: string }, v?: Record<string, string>): FormState => {
  logServerError(context, error);
  return { status: "error", message: rpcErrorMessage(error), values: v };
};
const idSchema = z.uuid();

// ---------------------------------------------------------------------------
// Contas a pagar
// ---------------------------------------------------------------------------

const BILL_FIELDS = [
  "name", "amount", "dueDate", "categoryId", "description",
  "finePercent", "interestRate", "interestPeriod", "interestBasis", "repeat", "repeatUntil",
];

const optionalRequestId = (form: FormData) => {
  const parsed = idSchema.safeParse(text(form, "requestId"));
  return parsed.success ? parsed.data : undefined;
};

function chargeColumns(b: z.infer<typeof billSchema>) {
  return {
    fine_percent: dbRate(b.finePercent),
    interest_rate: dbRate(b.interestRate),
    interest_period: b.interestRate === 0n ? null : b.interestPeriod,
    interest_basis: b.interestBasis,
  };
}

export async function createBillAction(_prev: FormState, form: FormData): Promise<FormState> {
  const membership = await requireMember();
  const v = values(form, BILL_FIELDS);
  const parsed = billSchema.safeParse(v);
  if (!parsed.success) return invalid(parsed.error, v);

  const b = parsed.data;
  const supabase = await createClient();

  if (b.repeat) {
    const charges = chargeColumns(b);
    const { error } = await supabase.rpc("create_recurrence", {
      p_target: "bill",
      p_frequency: b.repeat,
      p_interval: 1,
      p_day_of_month: b.repeat === "monthly" ? Number(b.dueDate.slice(8)) : null,
      p_starts_on: b.dueDate,
      p_ends_on: b.repeatUntil,
      p_template: {
        name: b.name,
        amount: dbMoney(b.amount),
        category_id: b.categoryId,
        description: b.description,
        fine_percent: charges.fine_percent,
        interest_rate: charges.interest_rate,
        interest_period: charges.interest_period,
        interest_basis: charges.interest_basis,
      },
      p_request_id: optionalRequestId(form),
    });
    if (error) return dbError("createRecurringBill", error, v);
    revalidatePath("/contas");
    redirect("/contas?ver=open&recorrente=1");
  }

  const { data, error } = await supabase
    .from("bills")
    .insert({
      household_id: membership.householdId,
      name: b.name,
      original_amount: dbMoney(b.amount),
      due_date: b.dueDate,
      category_id: b.categoryId,
      description: b.description,
      ...chargeColumns(b),
    })
    .select("id")
    .single();
  if (error) return dbError("createBill", error, v);

  revalidatePath("/contas");
  redirect(`/contas/${data.id}?salvo=1`);
}

export async function stopRecurrenceAction(billId: string, ruleId: string): Promise<FormState> {
  await requireMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("stop_recurrence", { p_rule_id: ruleId });
  if (error) return dbError("stopRecurrence", error);
  revalidatePath("/contas");
  redirect(`/contas/${billId}?repeticao-encerrada=1`);
}

export async function updateBillAction(billId: string, _prev: FormState, form: FormData): Promise<FormState> {
  await requireMember();
  if (!idSchema.safeParse(billId).success) return { status: "error", message: rpcErrorMessage({ message: "not_found" }) };
  const v = values(form, BILL_FIELDS);
  const parsed = billSchema.safeParse(v);
  if (!parsed.success) return invalid(parsed.error, v);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bills")
    .update({
      name: parsed.data.name,
      original_amount: dbMoney(parsed.data.amount),
      due_date: parsed.data.dueDate,
      category_id: parsed.data.categoryId,
      description: parsed.data.description,
      ...chargeColumns(parsed.data),
    })
    .eq("id", billId)
    .select("id");
  if (error) return dbError("updateBill", error, v);
  if (data.length === 0) return { status: "error", message: rpcErrorMessage({ message: "not_found" }), values: v };

  revalidatePath("/contas");
  redirect(`/contas/${billId}?salvo=1`);
}

const PAYMENT_FIELDS = ["amount", "charges", "paidOn", "accountId", "paymentMethod", "note", "requestId"];

export async function payBillAction(billId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const membership = await requireMember();
  const v = values(form, PAYMENT_FIELDS);
  const parsed = paymentSchema.safeParse(v);
  if (!parsed.success) return invalid(parsed.error, v);

  const today = todayFor(membership);
  const bill = await getBill(billId, today);
  if (!bill) return { status: "error", message: rpcErrorMessage({ message: "not_found" }), values: v };

  const check = checkPayment({
    status: bill.status,
    outstandingCents: bill.summary.outstandingCents,
    amountCents: parsed.data.amount,
    chargesCents: parsed.data.charges,
    paidOn: parsed.data.paidOn,
    today,
  });
  if (!check.ok) {
    return check.field === "form"
      ? { status: "error", message: check.error, values: v }
      : { status: "error", message: "Confira os campos destacados.", fieldErrors: { [check.field]: [check.error] }, values: v };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_bill_payment", {
    p_bill_id: billId,
    p_paid_on: parsed.data.paidOn,
    p_amount: dbMoney(parsed.data.amount),
    p_charges_amount: dbMoney(parsed.data.charges),
    p_account_id: parsed.data.accountId ?? undefined,
    p_payment_method: parsed.data.paymentMethod ?? undefined,
    p_note: parsed.data.note ?? undefined,
    p_request_id: parsed.data.requestId,
  });
  if (error) return dbError("payBill", error, v);

  revalidatePath("/contas");
  revalidatePath("/lancamentos");
  redirect(`/contas/${billId}?pago=1`);
}

export async function cancelBillAction(billId: string, _prev: FormState, form: FormData): Promise<FormState> {
  await requireMember();
  const v = values(form, ["reason"]);
  const parsed = cancelSchema.safeParse(v);
  if (!parsed.success) return invalid(parsed.error, v);

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_bill", { p_bill_id: billId, p_reason: parsed.data.reason });
  if (error) return dbError("cancelBill", error, v);

  revalidatePath("/contas");
  redirect(`/contas/${billId}?cancelada=1`);
}

export async function cancelPaymentAction(
  billId: string,
  paymentId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  await requireMember();
  const v = values(form, ["reason"]);
  const parsed = cancelSchema.safeParse(v);
  if (!parsed.success) return invalid(parsed.error, v);

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_bill_payment", { p_payment_id: paymentId, p_reason: parsed.data.reason });
  if (error) return dbError("cancelPayment", error, v);

  revalidatePath("/contas");
  revalidatePath("/lancamentos");
  redirect(`/contas/${billId}?pagamento-cancelado=1`);
}

// ---------------------------------------------------------------------------
// Lançamentos (receitas e despesas)
// ---------------------------------------------------------------------------

const TX_FIELDS = [
  "type", "status", "description", "amount", "occurredOn", "categoryId",
  "accountId", "paymentMethod", "nature", "notes", "repeatMonthly", "requestId",
];

export async function createTransactionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const membership = await requireMember();
  const v = values(form, TX_FIELDS);
  const parsed = transactionSchema.safeParse(v);
  if (!parsed.success) return invalid(parsed.error, v);
  const t = parsed.data;
  const isExpense = t.type === "expense";
  const supabase = await createClient();

  if (t.repeatMonthly) {
    // Repetidos nascem como PREVISTOS; a pessoa confirma quando acontecer.
    const { error } = await supabase.rpc("create_recurrence", {
      p_target: t.type,
      p_frequency: "monthly",
      p_interval: 1,
      p_day_of_month: Number(t.occurredOn.slice(8)),
      p_starts_on: t.occurredOn,
      p_ends_on: null,
      p_template: { description: t.description, amount: dbMoney(t.amount), category_id: t.categoryId, account_id: t.accountId, notes: t.notes },
      p_request_id: t.requestId,
    });
    if (error) return dbError("createRecurringTransaction", error, v);
    revalidatePath("/lancamentos");
    redirect(`/lancamentos?mes=${t.occurredOn.slice(0, 7)}&salvo=recorrente`);
  }

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      household_id: membership.householdId,
      type: t.type,
      status: t.status,
      amount: dbMoney(t.amount),
      occurred_on: t.occurredOn,
      description: t.description,
      notes: t.notes,
      category_id: t.categoryId,
      account_id: t.accountId,
      payment_method: isExpense ? t.paymentMethod : null,
      nature: isExpense ? t.nature : null,
      request_id: t.requestId,
    })
    .select("id")
    .single();

  let id = data?.id;
  if (error?.code === "23505") {
    // Mesmo formulário enviado de novo: o lançamento já existe.
    const existing = await supabase.from("transactions").select("id").eq("request_id", t.requestId).maybeSingle();
    if (existing.error || !existing.data) return dbError("createTransaction retry", existing.error ?? error, v);
    id = existing.data.id;
  } else if (error) {
    return dbError("createTransaction", error, v);
  }

  revalidatePath("/lancamentos");
  redirect(`/lancamentos?mes=${t.occurredOn.slice(0, 7)}&salvo=${id}`);
}

export async function updateTransactionAction(txId: string, _prev: FormState, form: FormData): Promise<FormState> {
  await requireMember();
  const current = idSchema.safeParse(txId).success ? await getTransaction(txId) : null;
  if (!current) return { status: "error", message: rpcErrorMessage({ message: "not_found" }) };

  const v = values(form, TX_FIELDS);
  const parsed = transactionSchema.safeParse({ ...v, type: current.type, repeatMonthly: "", requestId: crypto.randomUUID() });
  if (!parsed.success) return invalid(parsed.error, v);
  const t = parsed.data;
  const isExpense = current.type === "expense";

  // Lançamento gerado por pagamento: só descrição, categoria e observação.
  const changes = current.billPaymentId
    ? { description: t.description, notes: t.notes, category_id: t.categoryId }
    : {
        status: t.status,
        amount: dbMoney(t.amount),
        occurred_on: t.occurredOn,
        description: t.description,
        notes: t.notes,
        category_id: t.categoryId,
        account_id: t.accountId,
        payment_method: isExpense ? t.paymentMethod : null,
        nature: isExpense ? t.nature : null,
      };

  const supabase = await createClient();
  const { data, error } = await supabase.from("transactions").update(changes).eq("id", txId).select("id");
  if (error) return dbError("updateTransaction", error, v);
  if (data.length === 0) return { status: "error", message: rpcErrorMessage({ message: "not_found" }), values: v };

  revalidatePath("/lancamentos");
  redirect(`/lancamentos/${txId}?salvo=1`);
}

export async function cancelTransactionAction(txId: string, _prev: FormState, form: FormData): Promise<FormState> {
  await requireMember();
  const v = values(form, ["reason"]);
  const parsed = cancelSchema.safeParse(v);
  if (!parsed.success) return invalid(parsed.error, v);

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_transaction", { p_transaction_id: txId, p_reason: parsed.data.reason });
  if (error) return dbError("cancelTransaction", error, v);

  revalidatePath("/lancamentos");
  redirect(`/lancamentos/${txId}?cancelado=1`);
}

// ---------------------------------------------------------------------------
// Parcelamentos
// ---------------------------------------------------------------------------

const PLAN_FIELDS = ["description", "kind", "categoryId", "total", "count", "firstDueDate", "method", "rate", "requestId"];

export async function createPlanAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireMember();
  const v = values(form, PLAN_FIELDS);
  const parsed = planSchema.safeParse(v);
  if (!parsed.success) return invalid(parsed.error, v);
  const p = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_installment_plan", {
    p_kind: p.kind,
    p_description: p.description,
    p_category_id: p.categoryId,
    p_total: dbMoney(p.total),
    p_count: p.count,
    p_first_due: p.firstDueDate,
    p_method: p.method,
    p_rate: dbRate(p.rate),
    p_request_id: p.requestId,
  });
  if (error || !data) return dbError("createPlan", error ?? { message: "unknown" }, v);
  revalidatePath("/parcelas");
  redirect(`/parcelas/${data}?salvo=1`);
}

export async function payInstallmentAction(planId: string, installmentId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const membership = await requireMember();
  const v = values(form, PAYMENT_FIELDS);
  const parsed = paymentSchema.safeParse(v);
  if (!parsed.success) return invalid(parsed.error, v);

  const today = todayFor(membership);
  const plan = await getPlan(planId, today);
  const installment = plan?.installments.find((i) => i.id === installmentId);
  if (!plan || !installment) return { status: "error", message: rpcErrorMessage({ message: "not_found" }), values: v };

  const check = checkPayment({
    status: plan.status === "canceled" ? "canceled" : installment.status,
    outstandingCents: installment.expectedCents - installment.paidPrincipalCents,
    amountCents: parsed.data.amount,
    chargesCents: parsed.data.charges,
    paidOn: parsed.data.paidOn,
    today,
  });
  if (!check.ok) {
    return check.field === "form"
      ? { status: "error", message: check.error, values: v }
      : { status: "error", message: "Confira os campos destacados.", fieldErrors: { [check.field]: [check.error] }, values: v };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_installment_payment", {
    p_installment_id: installmentId,
    p_paid_on: parsed.data.paidOn,
    p_amount: dbMoney(parsed.data.amount),
    p_charges_amount: dbMoney(parsed.data.charges),
    p_account_id: parsed.data.accountId ?? undefined,
    p_payment_method: parsed.data.paymentMethod ?? undefined,
    p_note: parsed.data.note ?? undefined,
    p_request_id: parsed.data.requestId,
  });
  if (error) return dbError("payInstallment", error, v);
  revalidatePath("/parcelas");
  revalidatePath("/lancamentos");
  redirect(`/parcelas/${planId}?pago=1`);
}

export async function cancelInstallmentPaymentAction(planId: string, paymentId: string, _prev: FormState, form: FormData): Promise<FormState> {
  await requireMember();
  const v = values(form, ["reason"]);
  const parsed = cancelSchema.safeParse(v);
  if (!parsed.success) return invalid(parsed.error, v);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_bill_payment", { p_payment_id: paymentId, p_reason: parsed.data.reason });
  if (error) return dbError("cancelInstallmentPayment", error, v);
  revalidatePath("/parcelas");
  revalidatePath("/lancamentos");
  redirect(`/parcelas/${planId}?pagamento-cancelado=1`);
}

export async function cancelPlanAction(planId: string, _prev: FormState, form: FormData): Promise<FormState> {
  await requireMember();
  const v = values(form, ["reason"]);
  const parsed = cancelSchema.safeParse(v);
  if (!parsed.success) return invalid(parsed.error, v);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_installment_plan", { p_plan_id: planId, p_reason: parsed.data.reason });
  if (error) return dbError("cancelPlan", error, v);
  revalidatePath("/parcelas");
  redirect(`/parcelas/${planId}?cancelado=1`);
}
