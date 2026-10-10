"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/form-message";
import { checkPayment } from "@/domain/bills";
import { dbMoney } from "@/lib/supabase/money";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/auth";
import { billSchema, cancelSchema, paymentSchema, transactionSchema } from "@/lib/validation/finance";
import { logServerError, rpcErrorMessage } from "../errors";
import { requireMember, todayFor } from "../session";
import { getBill, getTransaction } from "./queries";

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

const BILL_FIELDS = ["name", "amount", "dueDate", "categoryId", "description"];

export async function createBillAction(_prev: FormState, form: FormData): Promise<FormState> {
  const membership = await requireMember();
  const v = values(form, BILL_FIELDS);
  const parsed = billSchema.safeParse(v);
  if (!parsed.success) return invalid(parsed.error, v);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bills")
    .insert({
      household_id: membership.householdId,
      name: parsed.data.name,
      original_amount: dbMoney(parsed.data.amount),
      due_date: parsed.data.dueDate,
      category_id: parsed.data.categoryId,
      description: parsed.data.description,
    })
    .select("id")
    .single();
  if (error) return dbError("createBill", error, v);

  revalidatePath("/contas");
  redirect(`/contas/${data.id}?salvo=1`);
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
  "accountId", "paymentMethod", "nature", "notes", "requestId",
];

export async function createTransactionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const membership = await requireMember();
  const v = values(form, TX_FIELDS);
  const parsed = transactionSchema.safeParse(v);
  if (!parsed.success) return invalid(parsed.error, v);
  const t = parsed.data;
  const isExpense = t.type === "expense";

  const supabase = await createClient();
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
  const parsed = transactionSchema.safeParse({ ...v, type: current.type, requestId: crypto.randomUUID() });
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
